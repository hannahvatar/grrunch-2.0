// Signed links for the weekly email's "Unsubscribe" and "Keep them
// coming" buttons (send-weekly-email, weekly-email-preferences). Nobody
// signs in from an email, so each link carries the user id plus an HMAC
// of it; without the secret (EMAIL_LINK_SECRET) nobody can make a link
// that changes someone else's settings.

const encoder = new TextEncoder();

async function key(): Promise<CryptoKey> {
  const secret = Deno.env.get("EMAIL_LINK_SECRET");
  if (!secret) throw new Error("EMAIL_LINK_SECRET is not set.");
  return crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
    "verify",
  ]);
}

function toHex(bytes: ArrayBuffer): string {
  return Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function signUserId(userId: string): Promise<string> {
  return toHex(await crypto.subtle.sign("HMAC", await key(), encoder.encode(`weekly-email:${userId}`)));
}

export async function verifyUserId(userId: string, token: string): Promise<boolean> {
  if (!/^[0-9a-f]{64}$/.test(token)) return false;
  const expected = await signUserId(userId);
  // Constant-time compare.
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ token.charCodeAt(i);
  return diff === 0;
}
