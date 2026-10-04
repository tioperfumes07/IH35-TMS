export default {
  name: "verify:legal-contract-batch-download-silent-noop",
  run(ctx) {
    ctx.run("node", ["scripts/verify-legal-contract-batch-download-silent-noop.mjs"]);
  },
};
