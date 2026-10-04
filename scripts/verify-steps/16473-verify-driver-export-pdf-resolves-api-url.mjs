export default {
  name: "verify:driver-export-pdf-resolves-api-url",
  run(ctx) {
    ctx.run("node", ["scripts/verify-driver-export-pdf-resolves-api-url.mjs"]);
  },
};
