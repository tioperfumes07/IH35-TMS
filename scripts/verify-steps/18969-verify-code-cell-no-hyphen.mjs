export default {
  name: "verify:code-cell-no-hyphen",
  run(ctx) {
    ctx.run("node", ["scripts/verify-code-cell-no-hyphen.mjs"]);
  },
};
