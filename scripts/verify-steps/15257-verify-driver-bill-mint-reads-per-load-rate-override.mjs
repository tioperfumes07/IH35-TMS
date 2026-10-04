export default {
  name: "verify:driver-bill-mint-reads-per-load-rate-override",
  run(ctx) {
    ctx.run("node", ["scripts/verify-driver-bill-mint-reads-per-load-rate-override.mjs"]);
  },
};
