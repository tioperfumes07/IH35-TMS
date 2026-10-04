export default {
  name: "verify:driver-scheduler-temp-cover-company-lifecycle",
  run(ctx) {
    ctx.run("node", ["scripts/verify-driver-scheduler-temp-cover-company-lifecycle.mjs"]);
  },
};
