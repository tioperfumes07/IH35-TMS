export default {
  name: "verify:reg021-legacy-drawers-use-paritydrawer",
  run(ctx) {
    ctx.run("node", ["scripts/verify-reg021-legacy-drawers-use-paritydrawer.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-reg021-legacy-drawers-use-paritydrawer.mjs"]);
  },
};
