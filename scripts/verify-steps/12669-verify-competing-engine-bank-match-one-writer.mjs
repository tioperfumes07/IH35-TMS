export default {
  name: "verify:competing-engine-bank-match-one-writer",
  run(ctx) {
    ctx.run("node", ["scripts/verify-competing-engine-bank-match-one-writer.mjs"]);
  },
};
