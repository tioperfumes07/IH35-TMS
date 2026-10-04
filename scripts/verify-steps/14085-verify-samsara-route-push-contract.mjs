export default {
  name: "verify:samsara-route-push-contract",
  run(ctx) {
    ctx.run("node", ["scripts/verify-samsara-route-push-contract.mjs"]);
  },
};
