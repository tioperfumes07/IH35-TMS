// Rule 17 — ND-FA-01 owned-unit → accounting.fixed_assets register path (verify-steps only).
export default {
  name: "owned-units-registered",
  run(ctx) {
    if (ctx.run("node", ["scripts/verify-owned-units-registered.mjs", "--selftest"]) !== 0) return 1;
    if (ctx.run("node", ["scripts/verify-owned-units-registered.mjs"]) !== 0) return 1;
    return 0;
  },
};
