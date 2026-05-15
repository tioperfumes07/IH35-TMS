import crypto from "node:crypto";

/** Intuit webhooks: base64 HMAC-SHA256(payload, verifier token), compared to `intuit-signature` header. */
export function verifyIntuitWebhookSignature(rawBody: Buffer, verifierToken: string, intuitSignatureHeader: string | undefined): boolean {
  if (!verifierToken || !intuitSignatureHeader) return false;
  const expected = crypto.createHmac("sha256", verifierToken).update(rawBody).digest("base64");
  const a = Buffer.from(intuitSignatureHeader.trim(), "utf8");
  const b = Buffer.from(expected.trim(), "utf8");
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}
