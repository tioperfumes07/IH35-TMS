export default {
  name: "verify:factoring-package-metadata-failures-caught",
  run(ctx) {
    ctx.run("node", ["scripts/verify-factoring-package-metadata-failures-caught.mjs"]);
  },
};
