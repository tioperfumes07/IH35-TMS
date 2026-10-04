export default {
  name: "verify:e05-legs-evidence-chain",
  run(ctx) {
    ctx.run("node", ["scripts/verify-e05-legs-evidence-chain.mjs"]);
  },
};
