import crypto from "node:crypto";

/**
 * MVP: HMAC-SHA256(hex) of raw body vs webhook signing secret (Render: SAMSARA_WEBHOOK_SECRET).
 * TODO(post-mvp-samsara): align with Samsara's documented webhook signature scheme if different.
 */
export function verifySamsaraWebhookSignature(
  rawBody: Buffer,
  secret: string | undefined,
  headers: Record<string, string | string[] | undefined>
): boolean {
  if (!secret) return false;
  const expected = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  const headerNames = ["x-samsara-signature", "x-webhook-signature", "x-signature"];
  const rawPieces: string[] = [];
  for (const name of headerNames) {
    const v = headers[name] ?? headers[name.toLowerCase()];
    if (typeof v === "string" && v.trim()) rawPieces.push(v.trim());
    else if (Array.isArray(v)) {
      for (const p of v) {
        if (p.trim()) rawPieces.push(p.trim());
      }
    }
  }
  for (const piece of rawPieces) {
    for (const token of piece.split(/[\s,]+/).filter(Boolean)) {
      const hex = token.replace(/^sha256=/i, "").replace(/^v0=/i, "");
      if (hex.length !== expected.length) continue;
      try {
        if (crypto.timingSafeEqual(Buffer.from(hex, "hex"), Buffer.from(expected, "hex"))) return true;
      } catch {
        /* invalid hex */
      }
    }
  }
  return false;
}
