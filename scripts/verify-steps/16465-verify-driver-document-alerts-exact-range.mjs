export default {
  name: "verify:driver-document-alerts-exact-range",
  run(ctx) {
    ctx.run("node", ["scripts/verify-driver-document-alerts-exact-range.mjs"]);
  },
};
