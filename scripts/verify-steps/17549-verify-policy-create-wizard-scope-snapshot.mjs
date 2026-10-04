export default {
  name: "verify:policy-create-wizard-scope-snapshot",
  run(ctx) {
    ctx.run("node", ["scripts/verify-policy-create-wizard-scope-snapshot.mjs"]);
  },
};
