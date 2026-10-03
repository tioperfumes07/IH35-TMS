export default {
  name: "verify:one-bank-match-writer-writes-je",
  run(ctx) {
    ctx.run("node", ["scripts/verify-one-bank-match-writer-writes-je.mjs"]);
  },
};
