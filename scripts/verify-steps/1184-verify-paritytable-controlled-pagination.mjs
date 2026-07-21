export default {
  name: "verify:paritytable-controlled-pagination",
  run(ctx) {
    ctx.run("node", ["scripts/verify-paritytable-controlled-pagination.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-paritytable-controlled-pagination.mjs"]);
  },
};
