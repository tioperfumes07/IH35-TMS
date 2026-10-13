export default {
  name: "verify-acct-dom-02-subledger-gl-control-rec",
  run(ctx) {
    ctx.run("node", ["scripts/verify-acct-dom-02-subledger-gl-control-rec.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-acct-dom-02-subledger-gl-control-rec.mjs"]);
    // RULING 443.71 #1 — the live A/R tie (open invoices = Accounts Receivable (A/R) control), replacing the QBO comparison.
    ctx.run("node", ["scripts/verify-ar-subledger-ties-to-gl.mjs", "--selftest"]);
    // 443.100: the live half of verify-ar-subledger-ties-to-gl runs in the live-DB job (ci.yml required-live-load-guard); its selftest stays here.
  },
};
