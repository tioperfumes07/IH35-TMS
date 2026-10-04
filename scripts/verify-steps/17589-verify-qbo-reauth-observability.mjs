export default {
  name: "verify:qbo-reauth-observability",
  run(ctx) {
    ctx.run("node", ["scripts/verify-qbo-reauth-observability.mjs"]);
  },
};
