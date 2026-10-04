export default {
  name: "verify:shipper-portal-no-internal-auth-confusion",
  run(ctx) {
    ctx.run("node", ["scripts/verify-shipper-portal-no-internal-auth-confusion.mjs"]);
  },
};
