// LEAD 443.113 AJK-01 — a same-total reassignment kept the OLD driver on the open driver bill. The guard locks the
// identity comparison in the one driver-bill engine and the named refusal for a closed bill. --selftest plants each
// violation and must catch it; then the real check.
const GUARD = "scripts/verify-reassign-moves-open-driver-bill.mjs";

export default {
  name: "verify:reassign-moves-open-driver-bill",
  run(ctx) {
    ctx.run("node", [GUARD, "--selftest"]);
    ctx.run("node", [GUARD]);
  },
};
