/**
 * Step 1243 — verify-rate-limit-client-ip.
 * Locks the fix for: behind Cloudflare, req.ip was the edge, so every per-route rate limit shared
 * a handful of buckets. Fails if trustProxy becomes `true` (client-chosen buckets), if the
 * keyGenerator is dropped, or if the resolver stops preferring CF-Connecting-IP.
 */
export default {
  name: "verify:rate-limit-client-ip",
  run(ctx) {
    ctx.run("node", ["scripts/verify-rate-limit-client-ip.mjs"]);
  },
};
