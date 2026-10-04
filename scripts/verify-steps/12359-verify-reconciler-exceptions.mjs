export default {
  name: "verify:reconciler-exceptions",
  run(ctx) {
    ctx.run("node", ["scripts/verify-reconciler-exceptions.mjs"]);
  },
};
