export default {
  name: "verify:load-import-dry-run-default",
  run(ctx) {
    ctx.run("node", ["scripts/verify-load-import-dry-run-default.mjs"]);
  },
};
