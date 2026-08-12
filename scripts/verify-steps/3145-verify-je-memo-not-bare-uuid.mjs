// verify-steps wrapper for scripts/verify-je-memo-not-bare-uuid.mjs
// (JE-MEMO-STORES-RAW-UUID-AT-POSTER, verify-step 3145). Same shape as
// verify-steps/3141-verify-ap-bill-number-not-load-number.mjs and siblings — the guard is a standalone
// scripts/verify-*.mjs (static, no DB needed) and this wrapper is what makes it FULLY WIRED per
// verify-guard-wired.mjs.
export default {
  name: "verify-je-memo-not-bare-uuid",
  run(ctx) {
    ctx.run("node", ["scripts/verify-je-memo-not-bare-uuid.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-je-memo-not-bare-uuid.mjs"]);
  },
};
