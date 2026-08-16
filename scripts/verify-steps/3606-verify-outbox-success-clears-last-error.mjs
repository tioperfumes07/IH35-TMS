// verify-steps wrapper — LV-OUTBOX-ERRCOL · claim 3606
export default {
  name: "verify-outbox-success-clears-last-error",
  run(ctx) {
    ctx.run("node", ["scripts/verify-outbox-success-clears-last-error.mjs"]);
  },
};
