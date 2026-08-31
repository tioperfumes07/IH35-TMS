// VOID-CANCEL-NOT-VOID (owner-verified live 2026-09-01, L-20260830-0020/0024). Step 10185 · CC-1 lane.
export default {
  name: "load-cancel-void-cascade",
  run(ctx) {
    ctx.run("node", ["scripts/verify-load-cancel-void-cascade.mjs", "--selftest"]);
    return ctx.run("node", ["scripts/verify-load-cancel-void-cascade.mjs"]);
  },
};
