export default {
  name: "verify:audit-session-attribution",
  run(ctx) {
    ctx.run("node", ["scripts/verify-audit-session-attribution.mjs"]);
  },
};
