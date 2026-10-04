export default {
  name: "verify:insurance-coi-create-scope-lifecycle",
  run(ctx) {
    ctx.run("node", ["scripts/verify-insurance-coi-create-scope-lifecycle.mjs"]);
  },
};
