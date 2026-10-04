export default {
  name: "verify:banking-workflow-b-archived",
  run(ctx) {
    ctx.run("node", ["scripts/verify-banking-workflow-b-archived.mjs"]);
  },
};
