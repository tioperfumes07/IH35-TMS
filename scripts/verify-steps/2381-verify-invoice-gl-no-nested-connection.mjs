// LV-011 — the invoice GL post must run on the caller's transaction, never a second connection
// (verify-step 2381 · Claude ODD band).
export default {
  name: "invoice-gl-no-nested-connection",
  run(ctx) {
    ctx.run("node", ["scripts/verify-invoice-gl-no-nested-connection.mjs", "--selftest"]);
    return ctx.run("node", ["scripts/verify-invoice-gl-no-nested-connection.mjs"]);
  },
};
