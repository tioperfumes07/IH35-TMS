export default {
  name: "verify:fact-fix1-duplicate-vendors-banner",
  run(ctx) {
    ctx.run("node", ["scripts/verify-fact-fix1-duplicate-vendors-banner.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-fact-fix1-duplicate-vendors-banner.mjs"]);
  },
};
