export default {
  name: "verify:finding-source-of-truth-block",
  run(ctx) {
    ctx.run("node", ["scripts/verify-finding-source-of-truth-block.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-finding-source-of-truth-block.mjs"]);
  },
};
