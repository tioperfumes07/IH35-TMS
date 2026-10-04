export default {
  name: "verify:cash-basis-engine-determinism",
  run(ctx) {
    ctx.run("node", ["scripts/verify-cash-basis-engine-determinism.mjs"]);
  },
};
