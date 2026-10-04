export default {
  name: "verify:cap-1-live-gps",
  run(ctx) {
    ctx.run("node", ["scripts/verify-cap-1-live-gps.mjs"]);
  },
};
