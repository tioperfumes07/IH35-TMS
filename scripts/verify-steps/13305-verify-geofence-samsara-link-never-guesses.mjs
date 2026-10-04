export default {
  name: "verify:geofence-samsara-link-never-guesses",
  run(ctx) {
    ctx.run("node", ["scripts/verify-geofence-samsara-link-never-guesses.mjs"]);
  },
};
