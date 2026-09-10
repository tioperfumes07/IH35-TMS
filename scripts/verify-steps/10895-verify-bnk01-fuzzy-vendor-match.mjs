export default {
  name: "verify:bnk01-fuzzy-vendor-match",
  run(ctx) {
    ctx.run("node", ["scripts/verify-bnk01-fuzzy-vendor-match.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-bnk01-fuzzy-vendor-match.mjs"]);
  },
};
