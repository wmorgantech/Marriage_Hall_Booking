import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { requestOtp, verifyOtp } from '../src/lib/otp';

// fetch is always mocked: these tests never reach Meta.
let fetchMock: ReturnType<typeof vi.fn>;

function okResponse() {
  return { ok: true, status: 200 };
}

function sentBody(call = -1) {
  const calls = fetchMock.mock.calls;
  const [, init] = call < 0 ? calls[calls.length + call] : calls[call];
  return JSON.parse((init as { body: string }).body);
}

// The code the user would receive on WhatsApp = the body parameter of the last send.
function sentCode(): string {
  return sentBody().template.components[0].parameters[0].text;
}

describe('otp', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('WHATSAPP_ACCESS_TOKEN', 'test-token');
    vi.stubEnv('WHATSAPP_PHONE_NUMBER_ID', '123456789012345');
    vi.stubEnv('WHATSAPP_GRAPH_VERSION', 'v99.0');
    vi.stubEnv('WHATSAPP_OTP_TEMPLATE_NAME', 'otp_new');
    vi.stubEnv('WHATSAPP_OTP_TEMPLATE_LANG', 'en');
    fetchMock = vi.fn(async () => okResponse());
    vi.stubGlobal('fetch', fetchMock);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('issues a 4-digit code and accepts it exactly once', async () => {
    await requestOtp('+919100000001');
    const code = sentCode();
    expect(code).toMatch(/^\d{4}$/);
    expect(await verifyOtp('+919100000001', code)).toBe(true);
    expect(await verifyOtp('+919100000001', code)).toBe(false); // single use
  });

  it('sends the approved otp_new template with the same code in body and copy-code button', async () => {
    await requestOtp('+919100000010');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, { method: string; headers: Record<string, string> }];
    expect(url).toBe('https://graph.facebook.com/v99.0/123456789012345/messages');
    expect(init.method).toBe('POST');
    expect(init.headers.Authorization).toBe('Bearer test-token');

    const body = sentBody();
    expect(body.messaging_product).toBe('whatsapp');
    expect(body.to).toBe('919100000010'); // digits only, no "+"
    expect(body.type).toBe('template');
    expect(body.template.name).toBe('otp_new');
    expect(body.template.language).toEqual({ code: 'en' });

    const [bodyComp, buttonComp] = body.template.components;
    expect(body.template.components).toHaveLength(2);
    expect(bodyComp.type).toBe('body');
    expect(bodyComp.parameters).toHaveLength(1);
    expect(bodyComp.parameters[0].type).toBe('text');
    expect(buttonComp).toMatchObject({ type: 'button', sub_type: 'url', index: '0' });
    expect(buttonComp.parameters).toHaveLength(1);
    expect(buttonComp.parameters[0].type).toBe('text');
    expect(buttonComp.parameters[0].text).toBe(bodyComp.parameters[0].text);
    expect(bodyComp.parameters[0].text).toMatch(/^\d{4}$/);
  });

  it('does not accept a code that was never requested (no static/dev bypass)', async () => {
    expect(await verifyOtp('+919100000002', '1234')).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('codes are bound to the phone number they were sent to', async () => {
    await requestOtp('+919100000003');
    const code = sentCode();
    expect(await verifyOtp('+919100000004', code)).toBe(false);
    expect(await verifyOtp('+919100000003', code)).toBe(true);
  });

  it('locks after 5 wrong attempts, even for the right code', async () => {
    await requestOtp('+919100000005');
    const code = sentCode();
    const wrong = code === '0000' ? '1111' : '0000';
    for (let i = 0; i < 5; i++) expect(await verifyOtp('+919100000005', wrong)).toBe(false);
    expect(await verifyOtp('+919100000005', code)).toBe(false);
  });

  it('is valid for 10 minutes and expires just after', async () => {
    await requestOtp('+919100000006');
    const code = sentCode();
    vi.advanceTimersByTime(10 * 60 * 1000 - 1000);
    // still valid at 9m59s: a wrong guess does not consume it
    expect(await verifyOtp('+919100000006', code === '0000' ? '1111' : '0000')).toBe(false);
    expect(await verifyOtp('+919100000006', code)).toBe(true);

    await requestOtp('+919100000016');
    const code2 = sentCode();
    vi.advanceTimersByTime(10 * 60 * 1000 + 1);
    expect(await verifyOtp('+919100000016', code2)).toBe(false);
  });

  it('is still valid after the old 5-minute limit', async () => {
    await requestOtp('+919100000017');
    const code = sentCode();
    vi.advanceTimersByTime(5 * 60 * 1000 + 1);
    expect(await verifyOtp('+919100000017', code)).toBe(true);
  });

  it('enforces a resend cooldown, then allows a new code that replaces the old one', async () => {
    await requestOtp('+919100000007');
    const first = sentCode();
    await expect(requestOtp('+919100000007')).rejects.toMatchObject({ status: 429 });
    expect(fetchMock).toHaveBeenCalledTimes(1); // the throttled request never reached Meta
    vi.advanceTimersByTime(31 * 1000);
    await requestOtp('+919100000007');
    const second = sentCode();
    if (first !== second) expect(await verifyOtp('+919100000007', first)).toBe(false);
    expect(await verifyOtp('+919100000007', second)).toBe(true);
  });

  describe('provider failures', () => {
    it('returns 503 when Meta rejects the request, and stores no code', async () => {
      fetchMock.mockResolvedValueOnce({ ok: false, status: 400 });
      await expect(requestOtp('+919100000008')).rejects.toMatchObject({ status: 503 });
      const code = sentCode();
      expect(await verifyOtp('+919100000008', code)).toBe(false);
    });

    it('a failed send does not start the resend cooldown', async () => {
      fetchMock.mockResolvedValueOnce({ ok: false, status: 500 });
      await expect(requestOtp('+919100000009')).rejects.toMatchObject({ status: 503 });
      await expect(requestOtp('+919100000009')).resolves.toBeUndefined();
    });

    it('returns 503 on a network error', async () => {
      fetchMock.mockRejectedValueOnce(new Error('network down'));
      await expect(requestOtp('+919100000011')).rejects.toMatchObject({ status: 503 });
    });

    it('returns 503 on a timeout (AbortError)', async () => {
      fetchMock.mockRejectedValueOnce(Object.assign(new Error('aborted'), { name: 'AbortError' }));
      await expect(requestOtp('+919100000012')).rejects.toMatchObject({ status: 503 });
    });

    it('returns 503 without calling Meta when configuration is missing', async () => {
      vi.stubEnv('WHATSAPP_ACCESS_TOKEN', '');
      await expect(requestOtp('+919100000013')).rejects.toMatchObject({ status: 503 });
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('never leaks the token or provider details in the error or logs', async () => {
      fetchMock.mockResolvedValueOnce({ ok: false, status: 401, text: async () => 'secret provider body' });
      const err = await requestOtp('+919100000014').catch((e) => e as Error);
      expect(err.message).not.toContain('test-token');
      expect(err.message).not.toContain('secret provider body');
      const logged = JSON.stringify((console.error as unknown as { mock: { calls: unknown[] } }).mock.calls);
      expect(logged).not.toContain('test-token');
      expect(logged).not.toContain('secret provider body');
    });
  });
});
