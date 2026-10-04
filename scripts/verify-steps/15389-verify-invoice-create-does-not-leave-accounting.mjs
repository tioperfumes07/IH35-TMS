export default {
  name: "verify:invoice-create-does-not-leave-accounting",
  run(ctx) {
    ctx.run("node", ["scripts/verify-invoice-create-does-not-leave-accounting.mjs"]);
  },
};
