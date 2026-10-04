export default {
  name: "verify:posting-lineage-ui-contract",
  run(ctx) {
    ctx.run("node", ["scripts/verify-posting-lineage-ui-contract.mjs"]);
  },
};
