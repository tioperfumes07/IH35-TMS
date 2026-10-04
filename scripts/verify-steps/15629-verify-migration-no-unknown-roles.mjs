export default {
  name: "verify:migration-no-unknown-roles",
  run(ctx) {
    ctx.run("node", ["scripts/verify-migration-no-unknown-roles.mjs"]);
  },
};
