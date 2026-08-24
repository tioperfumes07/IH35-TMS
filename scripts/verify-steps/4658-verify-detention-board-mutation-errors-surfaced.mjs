export default {
  name: "verify-detention-board-mutation-errors-surfaced",
  run(ctx) {
    if (ctx.run("node", ["scripts/verify-detention-board-mutation-errors-surfaced.mjs"]) !== 0) {
      throw new Error("verify-detention-board-mutation-errors-surfaced failed");
    }
  },
};
