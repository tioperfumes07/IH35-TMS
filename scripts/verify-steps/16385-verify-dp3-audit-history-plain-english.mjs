export default {
  name: "verify:dp3-audit-history-plain-english",
  run(ctx) {
    ctx.run("node", ["scripts/verify-dp3-audit-history-plain-english.mjs"]);
  },
};
