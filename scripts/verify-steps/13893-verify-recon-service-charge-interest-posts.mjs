export default {
  name: "verify:recon-service-charge-interest-posts",
  run(ctx) {
    ctx.run("node", ["scripts/verify-recon-service-charge-interest-posts.mjs"]);
  },
};
