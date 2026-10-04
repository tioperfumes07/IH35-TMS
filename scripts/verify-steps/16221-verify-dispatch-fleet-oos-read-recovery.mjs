export default {
  name: "verify:dispatch-fleet-oos-read-recovery",
  run(ctx) {
    ctx.run("node", ["scripts/verify-dispatch-fleet-oos-read-recovery.mjs"]);
  },
};
