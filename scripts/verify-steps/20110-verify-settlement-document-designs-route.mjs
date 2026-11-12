export default {
  name: "verify:settlement-document-designs-route",
  run(ctx) {
    ctx.run("node", ["scripts/verify-settlement-document-designs-route.mjs"]);
  },
};
