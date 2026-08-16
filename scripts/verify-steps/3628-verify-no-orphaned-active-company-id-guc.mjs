// verify-steps wrapper — LV-ORPHANED-GUC-WRITE-ACTIVE-COMPANY-ID · claim 3628
export default {
  name: "verify-no-orphaned-active-company-id-guc",
  run(ctx) {
    ctx.run("node", ["scripts/verify-no-orphaned-active-company-id-guc.mjs"]);
  },
};
