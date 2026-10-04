export default {
  name: "verify:road-service-wo-bill-race-locked",
  run(ctx) {
    ctx.run("node", ["scripts/verify-road-service-wo-bill-race-locked.mjs"]);
  },
};
