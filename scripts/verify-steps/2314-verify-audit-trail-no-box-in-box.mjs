// CLS-BOX-IN-BOX — Audit Trail page flatten (verify-step 2314 · Cursor EVEN band).
export default {
  name: "audit-trail-no-box-in-box",
  run(ctx) {
    return ctx.run("node", ["scripts/verify-audit-trail-no-box-in-box.mjs"]);
  },
};
