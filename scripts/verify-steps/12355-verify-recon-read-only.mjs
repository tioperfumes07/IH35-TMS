export default {
  name: "verify:recon-read-only",
  run(ctx) {
    ctx.run("node", ["scripts/verify-recon-read-only.mjs"]);
  },
};
