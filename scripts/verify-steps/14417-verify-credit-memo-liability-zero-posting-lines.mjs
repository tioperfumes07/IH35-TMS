export default {
  name: "verify:credit-memo-liability-zero-posting-lines",
  run(ctx) {
    ctx.run("node", ["scripts/verify-credit-memo-liability-zero-posting-lines.mjs"]);
  },
};
