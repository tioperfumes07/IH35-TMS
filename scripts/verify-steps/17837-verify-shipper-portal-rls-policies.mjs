export default {
  name: "verify:shipper-portal-rls-policies",
  run(ctx) {
    ctx.run("node", ["scripts/verify-shipper-portal-rls-policies.mjs"]);
  },
};
