export default {
  name: "verify:posting-column-contract",
  run(ctx) {
    ctx.run("node", ["scripts/verify-posting-column-contract.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-posting-column-contract.mjs"]);
  },
};
