export default {
  name: "verify:factoring-pledge-nets-credit-memos",
  run(ctx) {
    ctx.run("node", ["scripts/verify-factoring-pledge-nets-credit-memos.mjs"]);
  },
};
