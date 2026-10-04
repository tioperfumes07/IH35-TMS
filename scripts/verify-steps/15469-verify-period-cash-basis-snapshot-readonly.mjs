export default {
  name: "verify:period-cash-basis-snapshot-readonly",
  run(ctx) {
    ctx.run("node", ["scripts/verify-period-cash-basis-snapshot-readonly.mjs"]);
  },
};
