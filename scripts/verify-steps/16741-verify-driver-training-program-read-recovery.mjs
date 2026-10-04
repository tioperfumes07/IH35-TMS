export default {
  name: "verify:driver-training-program-read-recovery",
  run(ctx) {
    ctx.run("node", ["scripts/verify-driver-training-program-read-recovery.mjs"]);
  },
};
