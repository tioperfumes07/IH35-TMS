export default {
  name: "verify:resolve-opco-membership",
  run(ctx) {
    ctx.run("node", ["scripts/verify-resolve-opco-membership.mjs"]);
  },
};
