export default {
  name: "verify:bank-account-company-assignment",
  run(ctx) {
    ctx.run("node", ["scripts/verify-bank-account-company-assignment.mjs"]);
  },
};
