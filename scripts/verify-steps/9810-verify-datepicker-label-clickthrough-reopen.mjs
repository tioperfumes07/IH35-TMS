export default {
  name: "verify-datepicker-label-clickthrough-reopen",
  run(ctx) {
    if (ctx.run("node", ["scripts/verify-datepicker-label-clickthrough-reopen.mjs"]) !== 0) {
      throw new Error("verify-datepicker-label-clickthrough-reopen failed");
    }
  },
};
