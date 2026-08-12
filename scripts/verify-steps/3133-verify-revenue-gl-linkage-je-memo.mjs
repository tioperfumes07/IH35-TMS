// verify-steps wrapper for scripts/verify-revenue-gl-linkage-je-memo.mjs
// (CLS-LINKAGE-ONEWAY instance, Invoice -> JE revenue-linkage drill payload, verify-step 3133). Same
// shape as verify-steps/3129-verify-expenses-list-je-memo.mjs and siblings — the guard is a standalone
// scripts/verify-*.mjs (static, no DB needed) and this wrapper is what makes it FULLY WIRED per
// verify-guard-wired.mjs.
export default {
  name: "verify-revenue-gl-linkage-je-memo",
  run(ctx) {
    ctx.run("node", ["scripts/verify-revenue-gl-linkage-je-memo.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-revenue-gl-linkage-je-memo.mjs"]);
  },
};
