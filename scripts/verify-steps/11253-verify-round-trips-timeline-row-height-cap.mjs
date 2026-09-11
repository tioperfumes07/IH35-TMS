export default {
  name: "verify-round-trips-timeline-row-height-cap",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-round-trips-timeline-row-height-cap.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-round-trips-timeline-row-height-cap.mjs"]);
  },
};
