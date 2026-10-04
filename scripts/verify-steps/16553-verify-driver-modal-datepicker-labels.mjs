export default {
  name: "verify:driver-modal-datepicker-labels",
  run(ctx) {
    ctx.run("node", ["scripts/verify-driver-modal-datepicker-labels.mjs"]);
  },
};
