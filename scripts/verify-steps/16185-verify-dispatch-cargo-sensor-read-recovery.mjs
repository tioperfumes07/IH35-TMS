export default {
  name: "verify:dispatch-cargo-sensor-read-recovery",
  run(ctx) {
    ctx.run("node", ["scripts/verify-dispatch-cargo-sensor-read-recovery.mjs"]);
  },
};
