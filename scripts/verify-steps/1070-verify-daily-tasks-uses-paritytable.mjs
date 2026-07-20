export default {
  name: "verify:daily-tasks-uses-paritytable",
  run(ctx) {
    ctx.run("node", ["scripts/verify-daily-tasks-uses-paritytable.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-daily-tasks-uses-paritytable.mjs"]);
  },
};
