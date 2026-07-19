// Rule-17: bank-split vendor-bill atomic GL honesty (CPA VETO remediation).
// Step id 924 — globally free after open-PR audit (912/913/920–923 taken).
// Wired via verify:pre-commit auto-discovery — do NOT edit package.json / CI hotfiles.
export default {
  name: "bank-split-vendor-bill-gl-honesty",
  run(ctx) {
    if (ctx.run("node", ["scripts/verify-bank-split-vendor-bill-gl-honesty.mjs"]) !== 0) {
      throw new Error("verify-bank-split-vendor-bill-gl-honesty failed");
    }
    if (ctx.run("node", ["scripts/verify-bank-split-vendor-bill-gl-honesty.mjs", "--selftest"]) !== 0) {
      throw new Error("verify-bank-split-vendor-bill-gl-honesty selftest failed");
    }
  },
};
