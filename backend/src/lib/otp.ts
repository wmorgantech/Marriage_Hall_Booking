// ============================================================================
// TEMPORARY OTP PROVIDER — dev/demo stand-in, not a real SMS gateway.
//
// This is the ONLY place the temporary OTP value should ever appear. When
// real SMS/OTP integration is implemented, replace the body of
// `requestOtp`/`verifyOtp` below (call the real gateway, store/check a
// per-phone generated code, add expiry, etc.) — the rest of the auth flow
// (auth.routes.ts, User creation, token issuance) does not need to change.
// ============================================================================

const TEMPORARY_TEST_OTP = '1234';

/**
 * Request an OTP be sent to `phone`. Currently a no-op: no SMS is sent, and
 * the temporary OTP is always TEMPORARY_TEST_OTP. Swap this for a real
 * gateway call when SMS integration is implemented.
 */
export async function requestOtp(_phone: string): Promise<void> {
  // Intentionally empty — real SMS gateway integration goes here.
}

/**
 * Verify an OTP entered by the user for `phone`. Currently just compares
 * against the temporary test value. Swap this for a real per-phone/expiring
 * code lookup when SMS integration is implemented.
 */
export async function verifyOtp(_phone: string, code: string): Promise<boolean> {
  return code === TEMPORARY_TEST_OTP;
}
