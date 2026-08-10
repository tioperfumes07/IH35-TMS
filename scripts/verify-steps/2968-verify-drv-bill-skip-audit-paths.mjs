export default {
  name: "2968-verify-drv-bill-skip-audit-paths",
  run(ctx) {
    return ctx.run("node", ["scripts/verify-drv-bill-skip-audit-paths.mjs"]);
  },
};
