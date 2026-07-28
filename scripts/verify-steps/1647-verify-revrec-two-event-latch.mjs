export default {
  name: "verify-revrec-two-event-latch",
  async run(ctx) {
    ctx.run("node", ["scripts/verify-revrec-two-event-latch.mjs"]);
    ctx.run("node", ["scripts/verify-revrec-two-event-latch.mjs", "--selftest"]);
  },
};
