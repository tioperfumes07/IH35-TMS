export default {
  name: "verify:samsara-documents-engine",
  run(ctx) {
    ctx.run("node", ["scripts/verify-samsara-documents-engine.mjs"]);
  },
};
