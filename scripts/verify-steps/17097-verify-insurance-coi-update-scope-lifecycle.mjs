export default {
  name: "verify:insurance-coi-update-scope-lifecycle",
  run(ctx) {
    ctx.run("node", ["scripts/verify-insurance-coi-update-scope-lifecycle.mjs"]);
  },
};
