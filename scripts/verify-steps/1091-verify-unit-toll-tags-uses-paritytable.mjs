export default {
  name: "verify:unit-toll-tags-uses-paritytable",
  run(ctx) {
    ctx.run("node", ["scripts/verify-unit-toll-tags-uses-paritytable.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-unit-toll-tags-uses-paritytable.mjs"]);
  },
};
