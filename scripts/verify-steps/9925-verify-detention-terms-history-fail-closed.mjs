export default {
  name: "verify:detention-terms-history-fail-closed",
  run(ctx) {
    ctx.run("node", ["scripts/verify-detention-terms-history-fail-closed.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-detention-terms-history-fail-closed.mjs"]);
  },
};
