export default {
  name: "verify:maint-wo-terminal-line-add-lock",
  run(ctx) {
    ctx.run("node", ["scripts/verify-maint-wo-terminal-line-add-lock.mjs"]);
  },
};
