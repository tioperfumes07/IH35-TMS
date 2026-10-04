export default {
  name: "verify:money-dispatch-opco-resolver",
  run(ctx) {
    ctx.run("node", ["scripts/verify-money-dispatch-opco-resolver.mjs"]);
  },
};
