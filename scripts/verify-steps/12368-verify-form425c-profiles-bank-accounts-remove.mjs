export default {
  name: "verify:form425c-profiles-bank-accounts-remove",
  run(ctx) {
    ctx.run("node", ["scripts/verify-form425c-profiles-bank-accounts-remove.mjs"]);
  },
};
