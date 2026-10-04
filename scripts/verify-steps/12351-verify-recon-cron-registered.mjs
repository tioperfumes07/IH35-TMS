export default {
  name: "verify:recon-cron-registered",
  run(ctx) {
    ctx.run("node", ["scripts/verify-recon-cron-registered.mjs"]);
  },
};
