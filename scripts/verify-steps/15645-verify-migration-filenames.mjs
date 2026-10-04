export default {
  name: "verify:migration-filenames",
  run(ctx) {
    ctx.run("node", ["scripts/verify-migration-filenames.mjs"]);
  },
};
