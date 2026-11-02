export default {
  name: "verify:date-range-engine-contract",
  run(ctx) {
    ctx.run("node", ["scripts/verify-date-range-engine-contract.mjs"]);
  },
};
