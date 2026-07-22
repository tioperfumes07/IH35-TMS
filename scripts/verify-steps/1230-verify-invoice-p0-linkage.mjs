// P-INVOICE P0 (#3177) — Law §9 invoice income + source_load_id + JE EntityLink.
// Rule-17: step auto-discovered; do NOT edit package.json / locked-guards / ci.yml.
// Number ≥1230 (avoid 1220–1224 reserved).
export default {
  name: "invoice-p0-linkage",
  run(ctx) {
    ctx.run("node", ["scripts/verify-invoice-p0-linkage.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-invoice-p0-linkage.mjs"]);
  },
};
