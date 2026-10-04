export default {
  name: "verify:arrival-detection-wired-on-poll-path",
  run(ctx) {
    ctx.run("node", ["scripts/verify-arrival-detection-wired-on-poll-path.mjs"]);
  },
};
