export default {
  name: "verify:af1-coa-role-binding-heal",
  run(ctx) {
    ctx.run("node", ["scripts/verify-af1-coa-role-binding-heal.mjs"]);
  },
};
