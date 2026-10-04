export default {
  name: "verify:samsara-driver-mirror-both-statuses",
  run(ctx) {
    ctx.run("node", ["scripts/verify-samsara-driver-mirror-both-statuses.mjs"]);
  },
};
