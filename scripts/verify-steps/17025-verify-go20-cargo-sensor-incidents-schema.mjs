export default {
  name: "verify:go20-cargo-sensor-incidents-schema",
  run(ctx) {
    ctx.run("node", ["scripts/verify-go20-cargo-sensor-incidents-schema.mjs"]);
  },
};
