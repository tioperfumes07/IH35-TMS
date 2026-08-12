// verify-steps wrapper for scripts/verify-qbo-oauth-redirect-uri-not-logged.mjs
// (SEC-QBO-OAUTH-REDIRECT-URI-CLEARTEXT-LOG, verify-step 3163). Same shape as
// verify-steps/3159-verify-load-drawer-settlement-tab-load-aware.mjs — the guard is a standalone
// scripts/verify-*.mjs (static, no DB needed) and this wrapper is what makes it FULLY WIRED per
// verify-guard-wired.mjs.
export default {
  name: "verify-qbo-oauth-redirect-uri-not-logged",
  run(ctx) {
    ctx.run("node", ["scripts/verify-qbo-oauth-redirect-uri-not-logged.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-qbo-oauth-redirect-uri-not-logged.mjs"]);
  },
};
