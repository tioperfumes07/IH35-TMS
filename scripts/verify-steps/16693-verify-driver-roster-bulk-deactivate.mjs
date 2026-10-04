export default {
  name: "verify:driver-roster-bulk-deactivate",
  run(ctx) {
    ctx.run("node", ["scripts/verify-driver-roster-bulk-deactivate.mjs"]);
  },
};
