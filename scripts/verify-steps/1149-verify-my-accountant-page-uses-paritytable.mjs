export default {
  name: "verify:my-accountant-page-uses-paritytable",
  run(ctx) {
    ctx.run("node", ["scripts/verify-my-accountant-page-uses-paritytable.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-my-accountant-page-uses-paritytable.mjs"]);
  },
};
