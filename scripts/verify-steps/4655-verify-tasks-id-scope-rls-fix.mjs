export default {
  name: "verify-tasks-id-scope-rls-fix",
  run(ctx) {
    if (ctx.run("node", ["scripts/verify-tasks-id-scope-rls-fix.mjs"]) !== 0) {
      throw new Error("verify-tasks-id-scope-rls-fix failed");
    }
  },
};
