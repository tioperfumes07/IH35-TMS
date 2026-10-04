export default {
  name: "verify:period-cash-basis-snapshot-shape",
  run(ctx) {
    ctx.run("node", ["scripts/verify-period-cash-basis-snapshot-shape.mjs"]);
  },
};
