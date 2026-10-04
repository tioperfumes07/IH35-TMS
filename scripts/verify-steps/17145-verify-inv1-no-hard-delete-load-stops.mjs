export default {
  name: "verify:inv1-no-hard-delete-load-stops",
  run(ctx) {
    ctx.run("node", ["scripts/verify-inv1-no-hard-delete-load-stops.mjs"]);
  },
};
