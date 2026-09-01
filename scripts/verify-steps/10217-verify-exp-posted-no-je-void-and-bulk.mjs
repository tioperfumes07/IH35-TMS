// EXP-POSTED-NO-JE-01 (owner ruling 2026-09-01). Step 10217 · CC-1 lane.
export default {
  name: "exp-posted-no-je-void-and-bulk",
  run(ctx) {
    ctx.run("node", ["scripts/verify-exp-posted-no-je-void-and-bulk.mjs", "--selftest"]);
    return ctx.run("node", ["scripts/verify-exp-posted-no-je-void-and-bulk.mjs"]);
  },
};
