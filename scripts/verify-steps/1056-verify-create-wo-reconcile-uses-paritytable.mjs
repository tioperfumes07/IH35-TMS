export default {
  name: "verify:create-wo-reconcile-uses-paritytable",
  run(ctx) {
    ctx.run("node", [
      "scripts/verify-create-wo-reconcile-uses-paritytable.mjs",
      "--selftest",
    ]);
    ctx.run("node", [
      "scripts/verify-create-wo-reconcile-uses-paritytable.mjs",
    ]);
  },
};
