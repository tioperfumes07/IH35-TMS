export default {
  name: "verify:startup-migration-drift-guard",
  run(ctx) {
    ctx.run("node", ["scripts/verify-startup-migration-drift-guard.mjs"]);
  },
};
