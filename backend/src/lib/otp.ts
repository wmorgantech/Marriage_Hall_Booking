
import crypto from 'crypto';

// Matches the "This code expires in 10 minutes." line in the approved otp_new template.
const OTP_TTL_MS = 10 * 60 * 1000;
const RESEND_COOLDOWN_MS = 30 * 1000;
const MAX_ATTEMPTS = 5;
const WHATSAPP_TIMEOUT_MS = 8000;

type Entry = {
  hash: string;
  expiresAt: number;
  sentAt: number;
  attempts: number;
};

const store = new Map<string, Entry>();

function httpError(status: number, message: string) {
  return Object.assign(new Error(message), { status });
}

function hashCode(phone: string, code: string) {
  return crypto
    .createHash('sha256')
    .update(`${phone}:${code}`)
    .digest('hex');
}

function prune(now: number) {
  for (const [phone, entry] of store) {
    if (entry.expiresAt <= now) {
      store.delete(phone);
    }
  }
}

async function deliver(phone: string, code: string): Promise<void> {
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const graphVersion = process.env.WHATSAPP_GRAPH_VERSION;
  const templateName =
    process.env.WHATSAPP_OTP_TEMPLATE_NAME || 'otp_new';
  const language =
    process.env.WHATSAPP_OTP_TEMPLATE_LANG || 'en';

  if (!accessToken || !phoneNumberId || !graphVersion) {
    console.error('[WhatsApp OTP] Required configuration is missing.');
    throw httpError(503, 'OTP service is temporarily unavailable.');
  }

  // Convert E.164 phone number to digits only.
  const recipient = phone.replace(/\D/g, '');

  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    WHATSAPP_TIMEOUT_MS
  );

  try {
    const response = await fetch(
      `https://graph.facebook.com/${graphVersion}/${phoneNumberId}/messages`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: recipient,
          type: 'template',
          template: {
            name: templateName,
            language: {
              code: language,
            },
            components: [
              {
                type: 'body',
                parameters: [
                  {
                    type: 'text',
                    text: code,
                  },
                ],
              },
              // Copy-code button: Meta requires the same code again in the button.
              {
                type: 'button',
                sub_type: 'url',
                index: '0',
                parameters: [
                  {
                    type: 'text',
                    text: code,
                  },
                ],
              },
            ],
          },
        }),
        signal: controller.signal,
      }
    );

    if (!response.ok) {
      // Do not log the response body because it may contain
      // sensitive provider or request information.
      console.error(
        `[WhatsApp OTP] Provider request failed. HTTP ${response.status}`
      );

      throw httpError(
        503,
        'Unable to send OTP. Please try again later.'
      );
    }
  } catch (error) {
    if ((error as Error).name === 'AbortError') {
      console.error('[WhatsApp OTP] Provider request timed out.');
      throw httpError(
        503,
        'OTP delivery timed out. Please try again.'
      );
    }

    if ((error as { status?: number }).status) {
      throw error;
    }

    console.error('[WhatsApp OTP] Provider request failed.');
    throw httpError(
      503,
      'Unable to send OTP. Please try again later.'
    );
  } finally {
    clearTimeout(timeout);
  }
}

/** Generate and send a one-time code to phone through WhatsApp. */
export async function requestOtp(phone: string): Promise<void> {
  const now = Date.now();

  prune(now);

  const prev = store.get(phone);

  if (prev && now - prev.sentAt < RESEND_COOLDOWN_MS) {
    throw httpError(
      429,
      'Please wait a few seconds before requesting another code.'
    );
  }

  const code = String(
    crypto.randomInt(0, 10000)
  ).padStart(4, '0');

  // Store OTP only after WhatsApp API accepts the request.
  await deliver(phone, code);

  store.set(phone, {
    hash: hashCode(phone, code),
    expiresAt: now + OTP_TTL_MS,
    sentAt: now,
    attempts: 0,
  });
}

/** Verify OTP. A correct code is consumed and cannot be reused. */
export async function verifyOtp(
  phone: string,
  code: string
): Promise<boolean> {
  const now = Date.now();

  const entry = store.get(phone);

  if (!entry) {
    return false;
  }

  if (
    entry.expiresAt <= now ||
    entry.attempts >= MAX_ATTEMPTS
  ) {
    store.delete(phone);
    return false;
  }

  entry.attempts += 1;

  const expectedHash = Buffer.from(entry.hash, 'hex');
  const receivedHash = Buffer.from(hashCode(phone, code), 'hex');

  if (
    expectedHash.length !== receivedHash.length ||
    !crypto.timingSafeEqual(expectedHash, receivedHash)
  ) {
    return false;
  }

  store.delete(phone);

  return true;
}
