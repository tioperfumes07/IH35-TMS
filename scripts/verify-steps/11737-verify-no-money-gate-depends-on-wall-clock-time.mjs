// ROUND 251 Item 7 (owner, P0, 2026-09-30) — new standing law: no blocking money guard derives its
// verdict from wall-clock time. Permanent, static, shrink-only ratchet.
export default {
  name: "verify:no-money-gate-depends-on-wall-clock-time",
  run(ctx) {
    ctx.run("node", ["scripts/verify-no-money-gate-depends-on-wall-clock-time.mjs", "--selftest"]);
    return ctx.run("node", ["scripts/verify-no-money-gate-depends-on-wall-clock-time.mjs"]);
  },
};
