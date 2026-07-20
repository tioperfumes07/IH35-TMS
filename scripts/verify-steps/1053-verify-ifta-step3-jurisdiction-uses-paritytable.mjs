export default {
  name: "verify:ifta-step3-jurisdiction-uses-paritytable",
  run(ctx) {
    ctx.run("node", ["scripts/verify-ifta-step3-jurisdiction-uses-paritytable.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-ifta-step3-jurisdiction-uses-paritytable.mjs"]);
  },
};
