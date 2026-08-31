// SETL-NO-VOID-PATH-01 + BANK-ORPHAN-01 (owner ruling 2026-08-31/2026-09-01). Step 10189 · CC-1 lane.
export default {
  name: "settlement-void-cascade",
  run(ctx) {
    ctx.run("node", ["scripts/verify-settlement-void-cascade.mjs", "--selftest"]);
    return ctx.run("node", ["scripts/verify-settlement-void-cascade.mjs"]);
  },
};
