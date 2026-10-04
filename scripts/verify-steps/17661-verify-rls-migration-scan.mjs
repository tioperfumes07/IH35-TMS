export default {
  name: "verify:rls-migration-scan",
  run(ctx) {
    ctx.run("node", ["scripts/verify-rls-migration-scan.mjs"]);
  },
};
