export default {
  name: "verify:driver-availability-consistent-across-repeated-calls",
  run(ctx) {
    ctx.run("node", ["scripts/verify-driver-availability-consistent-across-repeated-calls.mjs"]);
  },
};
