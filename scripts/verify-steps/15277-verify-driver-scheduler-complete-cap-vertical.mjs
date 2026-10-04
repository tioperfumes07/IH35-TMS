export default {
  name: "verify:driver-scheduler-complete-cap-vertical",
  run(ctx) {
    ctx.run("node", ["scripts/verify-driver-scheduler-complete-cap-vertical.mjs"]);
  },
};
