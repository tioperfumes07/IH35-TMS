import { createHash } from "node:crypto";

/**
 * B5 (ROUND 203/206, Devin-A finding) — identity.driver_invites.token was stored and compared in
 * plaintext: any DB read access (or a backup/dump leak) exposed a live, unexpired, unused invite
 * token that could be redeemed by anyone, same class of exposure a plaintext password column would
 * be. The raw token (randomBytes(32).toString("hex"), still generated the same way) continues to
 * flow to the driver unchanged via the WhatsApp/email invite URL -- only what gets written to and
 * compared against the `token` column changes, matching the standard "store the hash, never the
 * secret" pattern this app already uses for other bearer-style credentials.
 */
export function hashInviteToken(rawToken: string): string {
  return createHash("sha256").update(rawToken, "utf8").digest("hex");
}
