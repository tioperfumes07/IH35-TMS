// verify-steps wrapper — LV-DRIVER-PWA-NOTIFY-SILENTLY-DROPPED · claim 3636
export default {
  name: "verify-pwa-driver-notifications-table",
  run(ctx) {
    ctx.run("node", ["scripts/verify-pwa-driver-notifications-table.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-pwa-driver-notifications-table.mjs"]);
  },
};
