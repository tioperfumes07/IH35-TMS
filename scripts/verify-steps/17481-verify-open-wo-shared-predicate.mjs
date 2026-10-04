export default {
  name: "verify:open-wo-shared-predicate",
  run(ctx) {
    ctx.run("node", ["scripts/verify-open-wo-shared-predicate.mjs"]);
  },
};
