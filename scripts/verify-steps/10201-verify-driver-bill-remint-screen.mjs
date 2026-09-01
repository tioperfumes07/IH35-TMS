// ACCT-F10164 REMINT SCREEN (LAW-FIX-INSTANTLY item 8). Step 10201 · CC-1 lane.
export default {
  name: "driver-bill-remint-screen",
  run(ctx) {
    ctx.run("node", ["scripts/verify-driver-bill-remint-screen.mjs", "--selftest"]);
    return ctx.run("node", ["scripts/verify-driver-bill-remint-screen.mjs"]);
  },
};
