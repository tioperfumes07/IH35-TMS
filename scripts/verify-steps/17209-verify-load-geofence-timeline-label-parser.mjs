export default {
  name: "verify:load-geofence-timeline-label-parser",
  run(ctx) {
    ctx.run("node", ["scripts/verify-load-geofence-timeline-label-parser.mjs"]);
  },
};
