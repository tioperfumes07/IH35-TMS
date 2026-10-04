export default {
  name: "verify:aggregate-savepoints",
  run(ctx) {
    ctx.run("node", ["scripts/verify-aggregate-savepoints.mjs"]);
  },
};
