export default {
  name: "verify:fuel-location-is-a-city",
  run(ctx) {
    ctx.run("node", ["scripts/verify-fuel-location-is-a-city.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-fuel-location-is-a-city.mjs"]);
  },
};
