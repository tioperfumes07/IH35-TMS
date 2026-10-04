export default {
  name: "verify:dispatch-factoring-queue-deeplinks",
  run(ctx) {
    ctx.run("node", ["scripts/verify-dispatch-factoring-queue-deeplinks.mjs"]);
  },
};
