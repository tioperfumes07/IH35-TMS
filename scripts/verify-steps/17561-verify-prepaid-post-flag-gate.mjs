export default {
  name: "verify:prepaid-post-flag-gate",
  run(ctx) {
    ctx.run("node", ["scripts/verify-prepaid-post-flag-gate.mjs"]);
  },
};
