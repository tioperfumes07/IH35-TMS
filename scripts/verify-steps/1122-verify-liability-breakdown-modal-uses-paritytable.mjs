export default {
  name: "verify:liability-breakdown-modal-uses-paritytable",
  run(ctx) {
    ctx.run("node", ["scripts/verify-liability-breakdown-modal-uses-paritytable.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-liability-breakdown-modal-uses-paritytable.mjs"]);
  },
};
