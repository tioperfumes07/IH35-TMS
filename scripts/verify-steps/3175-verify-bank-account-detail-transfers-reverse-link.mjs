// verify-steps wrapper for scripts/verify-bank-account-detail-transfers-reverse-link.mjs
// (P19-MODULE-BANKING-TRANSFERS-REVERSE-LINK, verify-step 3175). Same shape as
// verify-steps/3171-verify-unit-insurance-linked-policies.mjs — the guard is a standalone
// scripts/verify-*.mjs (static, no DB needed) and this wrapper is what makes it FULLY WIRED per
// verify-guard-wired.mjs.
export default {
  name: "verify-bank-account-detail-transfers-reverse-link",
  run(ctx) {
    ctx.run("node", ["scripts/verify-bank-account-detail-transfers-reverse-link.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-bank-account-detail-transfers-reverse-link.mjs"]);
  },
};
