export default {
  name: "verify:acct-r24-coa-role-superset",
  run(ctx) {
    ctx.run("node", ["scripts/verify-acct-r24-coa-role-superset.mjs"]);
  },
};
