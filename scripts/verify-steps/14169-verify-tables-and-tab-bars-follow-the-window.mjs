export default {
  name: "verify:tables-and-tab-bars-follow-the-window",
  run(ctx) {
    ctx.run("node", ["scripts/verify-tables-and-tab-bars-follow-the-window.mjs"]);
  },
};
