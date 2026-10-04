export default {
  name: "verify:ar-aging-contract",
  run(ctx) {
    ctx.run("node", ["scripts/verify-ar-aging-contract.mjs"]);
  },
};
