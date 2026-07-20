export default {
  name: "verify:lease-to-own-creator-uses-paritytable",
  run(ctx) {
    ctx.run("node", ["scripts/verify-lease-to-own-creator-uses-paritytable.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-lease-to-own-creator-uses-paritytable.mjs"]);
  },
};
