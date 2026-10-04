export default {
  name: "verify:insurance-lawsuit-create-scope-lifecycle",
  run(ctx) {
    ctx.run("node", ["scripts/verify-insurance-lawsuit-create-scope-lifecycle.mjs"]);
  },
};
