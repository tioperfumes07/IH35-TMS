export default {
  name: "verify:driver-reactivate-clears-deactivated-at",
  run(ctx) {
    ctx.run("node", ["scripts/verify-driver-reactivate-clears-deactivated-at.mjs"]);
  },
};
