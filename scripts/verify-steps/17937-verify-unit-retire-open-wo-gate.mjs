export default {
  name: "verify:unit-retire-open-wo-gate",
  run(ctx) {
    ctx.run("node", ["scripts/verify-unit-retire-open-wo-gate.mjs"]);
  },
};
