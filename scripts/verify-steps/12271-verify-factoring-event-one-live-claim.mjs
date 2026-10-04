export default {
  name: "verify:factoring-event-one-live-claim",
  run(ctx) {
    ctx.run("node", ["scripts/verify-factoring-event-one-live-claim.mjs"]);
  },
};
