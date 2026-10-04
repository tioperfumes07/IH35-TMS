export default {
  name: "verify:driver-residual-datepicker-label-associations",
  run(ctx) {
    ctx.run("node", ["scripts/verify-driver-residual-datepicker-label-associations.mjs"]);
  },
};
