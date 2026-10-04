export default {
  name: "verify:safety-company-business-date",
  run(ctx) {
    ctx.run("node", ["scripts/verify-safety-company-business-date.mjs"]);
  },
};
