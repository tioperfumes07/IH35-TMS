export default {
  name: "verify:cap-14-cargo-sensors",
  run(ctx) {
    ctx.run("node", ["scripts/verify-cap-14-cargo-sensors.mjs"]);
  },
};
