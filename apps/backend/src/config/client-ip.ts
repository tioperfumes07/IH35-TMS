/**
 * Client-IP resolution behind Cloudflare → Render.
 *
 * WHY THIS EXISTS
 * api.ih35dispatch.com is served through Cloudflare (`server: cloudflare`, `cf-ray`) in front of
 * Render (`x-render-origin-server: Render`). Fastify was constructed WITHOUT `trustProxy`, so
 * `req.ip` is the socket peer — Cloudflare's edge — not the caller.
 *
 * Effect before this change: the ~141 per-route `config.rateLimit` limits keyed on `req.ip`, which
 * meant every user on the internet shared a handful of Cloudflare egress buckets. One busy
 * legitimate tenant could exhaust the limit for everyone (a self-inflicted DoS), while an attacker
 * received the same allowance as the entire user base. The limits existed but did not limit
 * per-client.
 *
 * WHY NOT `trustProxy: true` / bare X-Forwarded-For
 * Trusting XFF unconditionally lets ANY caller spoof their identity by sending the header, which
 * turns a rate limit into a no-op and poisons audit trails. We trust ONLY Cloudflare's published
 * ranges, and we prefer `CF-Connecting-IP`, which Cloudflare overwrites on every request and a
 * client cannot forge through the edge.
 */

/**
 * Cloudflare published edge ranges (https://www.cloudflare.com/ips/).
 * Kept as data, not a wildcard: `trustProxy: true` would trust anyone.
 */
export const CLOUDFLARE_IP_RANGES: readonly string[] = [
  "173.245.48.0/20",
  "103.21.244.0/22",
  "103.22.200.0/22",
  "103.31.4.0/22",
  "141.101.64.0/18",
  "108.162.192.0/18",
  "190.93.240.0/20",
  "188.114.96.0/20",
  "197.234.240.0/22",
  "198.41.128.0/17",
  "162.158.0.0/15",
  "104.16.0.0/13",
  "104.24.0.0/14",
  "172.64.0.0/13",
  "131.0.72.0/22",
  "2400:cb00::/32",
  "2606:4700::/32",
  "2803:f800::/32",
  "2405:b500::/32",
  "2405:8100::/32",
  "2a06:98c0::/29",
  "2c0f:f248::/32",
];

/** Minimal shape needed to resolve a caller — keeps this unit testable without Fastify. */
export type IpResolvable = {
  headers: Record<string, string | string[] | undefined>;
  ip?: string;
};

function headerValue(req: IpResolvable, name: string): string | null {
  const raw = req.headers[name] ?? req.headers[name.toLowerCase()];
  const value = Array.isArray(raw) ? raw[0] : raw;
  const trimmed = typeof value === "string" ? value.trim() : "";
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * The caller's IP, for rate-limit bucketing and audit.
 *
 * Order: CF-Connecting-IP (set by Cloudflare, not client-forgeable through the edge) → req.ip
 * (correct once trustProxy is configured) → "unknown" so a bucket key always exists. We never read
 * X-Forwarded-For directly: its left-most entry is attacker-controlled.
 */
export function resolveClientIp(req: IpResolvable): string {
  return headerValue(req, "cf-connecting-ip") ?? (req.ip && req.ip.length > 0 ? req.ip : "unknown");
}
