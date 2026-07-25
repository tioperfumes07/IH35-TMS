export default {
  name: "verify-myaccountant-flag-seeded",
  run(ctx) {
    if (ctx.run("node", ["scripts/verify-myaccountant-flag-seeded.mjs"]) !== 0) return 1;
    return ctx.run("node", ["scripts/verify-myaccountant-flag-seeded.mjs", "--selftest"]);
  },
};
