export default {
  name: "verify:verify-match-vendor-joins-company-scoped",
  run(ctx) {
    ctx.run("node", ["scripts/verify-match-vendor-joins-company-scoped.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-match-vendor-joins-company-scoped.mjs"]);
  },
};
