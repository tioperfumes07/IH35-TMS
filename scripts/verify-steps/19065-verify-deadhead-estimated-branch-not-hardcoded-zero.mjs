export default {
  name: "verify:deadhead-estimated-branch-not-hardcoded-zero",
  run(ctx) {
    ctx.run("node", ["scripts/verify-deadhead-estimated-branch-not-hardcoded-zero.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-deadhead-estimated-branch-not-hardcoded-zero.mjs"]);
  },
};
