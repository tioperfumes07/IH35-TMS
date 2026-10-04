export default {
  name: "verify:create-user-grants-company-access",
  run(ctx) {
    ctx.run("node", ["scripts/verify-create-user-grants-company-access.mjs"]);
  },
};
