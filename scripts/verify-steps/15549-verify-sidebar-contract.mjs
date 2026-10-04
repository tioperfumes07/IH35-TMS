export default {
  name: "verify:sidebar-contract",
  run(ctx) {
    ctx.run("node", ["scripts/verify-sidebar-contract.mjs"]);
  },
};
