// 443.107 A: the live half (vendor sub-ledger = A/P control, per vendor, on the live ledger) runs in the live-DB job
// (ci.yml required-live-load-guard, prod read-only); a fresh migrated DB has no ap_control binding, so the heavy step keeps
// only the guard's offline --selftest.
export default {
  name: "verify:vendor-balances-equals-ap-control",
  run(ctx) {
    ctx.run("node", ["scripts/verify-vendor-balances-equals-ap-control.mjs", "--selftest"]);
  },
};
