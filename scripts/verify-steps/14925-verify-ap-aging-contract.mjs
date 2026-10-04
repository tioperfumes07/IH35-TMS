export default {
  name: "verify:ap-aging-contract",
  run(ctx) {
    ctx.run("node", ["scripts/verify-ap-aging-contract.mjs"]);
  },
};
