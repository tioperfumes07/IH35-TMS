export default {
  name: "verify-daily-tasks-cancel-wired",
  run(ctx) {
    if (ctx.run("node", ["scripts/verify-daily-tasks-cancel-wired.mjs"]) !== 0) {
      throw new Error("verify-daily-tasks-cancel-wired failed");
    }
  },
};
