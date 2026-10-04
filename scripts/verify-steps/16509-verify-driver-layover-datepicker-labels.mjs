export default {
  name: "verify:driver-layover-datepicker-labels",
  run(ctx) {
    ctx.run("node", ["scripts/verify-driver-layover-datepicker-labels.mjs"]);
  },
};
