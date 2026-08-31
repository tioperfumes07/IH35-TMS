// INV-OPEN-VOID-01 (owner-verified live 2026-09-01). Step 10193 · CC-1 lane.
export default {
  name: "inv-open-void-respects-void",
  run(ctx) {
    ctx.run("node", ["scripts/verify-inv-open-void-respects-void.mjs", "--selftest"]);
    return ctx.run("node", ["scripts/verify-inv-open-void-respects-void.mjs"]);
  },
};
