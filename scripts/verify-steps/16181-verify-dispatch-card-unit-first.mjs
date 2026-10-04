export default {
  name: "verify:dispatch-card-unit-first",
  run(ctx) {
    ctx.run("node", ["scripts/verify-dispatch-card-unit-first.mjs"]);
  },
};
