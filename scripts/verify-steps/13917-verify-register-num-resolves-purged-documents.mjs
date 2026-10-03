export default {
  name: "verify:register-num-resolves-purged-documents",
  run(ctx) {
    ctx.run("node", ["scripts/verify-register-num-resolves-purged-documents.mjs"]);
  },
};
