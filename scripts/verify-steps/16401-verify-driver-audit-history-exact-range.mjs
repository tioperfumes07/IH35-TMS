export default {
  name: "verify:driver-audit-history-exact-range",
  run(ctx) {
    ctx.run("node", ["scripts/verify-driver-audit-history-exact-range.mjs"]);
  },
};
