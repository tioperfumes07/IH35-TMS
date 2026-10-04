export default {
  name: "verify:position-poll-odometer-and-mirror-first",
  run(ctx) {
    ctx.run("node", ["scripts/verify-position-poll-odometer-and-mirror-first.mjs"]);
  },
};
