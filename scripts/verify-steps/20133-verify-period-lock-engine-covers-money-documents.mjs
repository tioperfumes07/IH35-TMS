export default {
  name: "verify:period-lock-engine-covers-money-documents",
  run(ctx) {
    ctx.run("node", ["scripts/verify-period-lock-engine-covers-money-documents.mjs"]);
    ctx.run("node", ["scripts/verify-period-lock-engine-covers-money-documents.mjs", "--selftest"]);
  },
};
