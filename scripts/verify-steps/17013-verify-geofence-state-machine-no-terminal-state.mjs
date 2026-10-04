export default {
  name: "verify:geofence-state-machine-no-terminal-state",
  run(ctx) {
    ctx.run("node", ["scripts/verify-geofence-state-machine-no-terminal-state.mjs"]);
  },
};
