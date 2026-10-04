export default {
  name: "verify:vendor-non-money-backfill",
  run(ctx) {
    ctx.run("node", ["scripts/verify-vendor-non-money-backfill.mjs"]);
  },
};
