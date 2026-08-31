// ACCT-F10164 (GO-IDLE-WAKE, 39 USMCA loads past delivery-evidence with zero driver_bills). Step
// 10173 · CC-1 lane.
export default {
  name: "load-remint-driver-bill-path",
  run(ctx) {
    ctx.run("node", ["scripts/verify-load-remint-driver-bill-path.mjs", "--selftest"]);
    return ctx.run("node", ["scripts/verify-load-remint-driver-bill-path.mjs"]);
  },
};
