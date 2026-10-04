export default {
  name: "verify:migration-no-runtime-raise",
  run(ctx) {
    ctx.run("node", ["scripts/verify-migration-no-runtime-raise.mjs"]);
  },
};
