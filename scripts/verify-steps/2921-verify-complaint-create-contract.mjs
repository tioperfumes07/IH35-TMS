export default {
  name: "verify:complaint-create-contract",
  run(ctx) {
    ctx.run("node", ["scripts/verify-complaint-create-contract.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-complaint-create-contract.mjs"]);
  },
};
