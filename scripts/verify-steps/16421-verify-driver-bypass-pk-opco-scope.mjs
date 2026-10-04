export default {
  name: "verify:driver-bypass-pk-opco-scope",
  run(ctx) {
    ctx.run("node", ["scripts/verify-driver-bypass-pk-opco-scope.mjs"]);
  },
};
