export default {
  name: "verify-tasks-id-scope-rls-fix",
  run(ctx) {
    if (ctx.run("node", ["scripts/verify-tasks-id-scope-rls-fix.mjs"]) !== 0) {
      throw new Error("verify-tasks-id-scope-rls-fix failed");
    }
    if (ctx.run("node", ["scripts/verify-task-alarm-atomic-delivery.mjs"]) !== 0) {
      throw new Error("verify-task-alarm-atomic-delivery failed");
    }
  },
};
