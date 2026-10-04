export default {
  name: "verify:audit-fix-4-no-overflow-1024",
  run(ctx) {
    ctx.run("node", ["scripts/verify-audit-fix-4-no-overflow-1024.mjs"]);
  },
};
