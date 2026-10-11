export default {
  name: "verify-acct-dom-02-subledger-gl-control-rec",
  run(ctx) {
    ctx.run("node", ["scripts/verify-acct-dom-02-subledger-gl-control-rec.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-acct-dom-02-subledger-gl-control-rec.mjs"]);
    // RULING 443.71 #1 — the live A/R tie (open invoices = Accounts Receivable (A/R) control), replacing the QBO comparison.
    ctx.run("node", ["scripts/verify-ar-subledger-ties-to-gl.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-ar-subledger-ties-to-gl.mjs"]);
  },
};
