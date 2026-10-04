export default {
  name: "verify:posting-engine-mvp-contract",
  run(ctx) {
    ctx.run("node", ["scripts/verify-posting-engine-mvp-contract.mjs"]);
  },
};
