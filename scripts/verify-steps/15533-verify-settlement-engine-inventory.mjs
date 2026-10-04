export default {
  name: "verify:settlement-engine-inventory",
  run(ctx) {
    ctx.run("node", ["scripts/verify-settlement-engine-inventory.mjs"]);
  },
};
