// P-INVOICE P0 fail-closed (#3177) — income + source_load_id. Reverse drill = PR #3188.
// Rule-17: step auto-discovered; do NOT edit package.json / locked-guards / ci.yml.
// Number ≥1227 (1222–1224 reserved by #3188; avoid 1225/1226).
export default {
  name: "invoice-p0-failclosed",
  run(ctx) {
    ctx.run("node", ["scripts/verify-invoice-p0-failclosed.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-invoice-p0-failclosed.mjs"]);
  },
};
