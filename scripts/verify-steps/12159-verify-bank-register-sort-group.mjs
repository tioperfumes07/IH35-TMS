export default {
  name: "verify:bank-register-sort-group",
  run(ctx) {
    ctx.run("node", ["scripts/verify-bank-register-sort-group.mjs"]);
  },
};
