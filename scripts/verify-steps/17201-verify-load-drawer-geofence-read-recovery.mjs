export default {
  name: "verify:load-drawer-geofence-read-recovery",
  run(ctx) {
    ctx.run("node", ["scripts/verify-load-drawer-geofence-read-recovery.mjs"]);
  },
};
