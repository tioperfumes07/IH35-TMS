export default {
  name: "2340-verify-drug-alcohol-dashboard-no-box-in-box",
  run(ctx) {
    return ctx.run("node", ["scripts/verify-drug-alcohol-dashboard-no-box-in-box.mjs"]);
  },
};
