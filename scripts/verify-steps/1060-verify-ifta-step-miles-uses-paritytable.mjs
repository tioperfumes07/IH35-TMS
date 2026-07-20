export default {
  name: "verify:ifta-step-miles-uses-paritytable",
  run(ctx) {
    ctx.run("node", ["scripts/verify-ifta-step-miles-uses-paritytable.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-ifta-step-miles-uses-paritytable.mjs"]);
  },
};
