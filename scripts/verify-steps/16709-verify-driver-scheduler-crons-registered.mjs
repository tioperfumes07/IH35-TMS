export default {
  name: "verify:driver-scheduler-crons-registered",
  run(ctx) {
    ctx.run("node", ["scripts/verify-driver-scheduler-crons-registered.mjs"]);
  },
};
