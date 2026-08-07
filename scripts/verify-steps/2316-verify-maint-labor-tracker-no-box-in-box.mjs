// CLS-BOX-IN-BOX + CLS-RAW-UUID-LABEL — LaborTracker flatten (verify-step 2316 · Cursor EVEN band).
export default {
  name: "maint-labor-tracker-no-box-in-box",
  run(ctx) {
    return ctx.run("node", ["scripts/verify-maint-labor-tracker-no-box-in-box.mjs"]);
  },
};
