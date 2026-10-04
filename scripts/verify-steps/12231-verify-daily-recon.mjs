export default {
  name: "verify:daily-recon",
  run(ctx) {
    ctx.run("node", ["scripts/verify-daily-recon.mjs"]);
  },
};
