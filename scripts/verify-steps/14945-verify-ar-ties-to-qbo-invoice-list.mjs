export default {
  name: "verify:ar-ties-to-qbo-invoice-list",
  run(ctx) {
    ctx.run("node", ["scripts/verify-ar-ties-to-qbo-invoice-list.mjs"]);
  },
};
