export default {
  name: "verify:factor-recon-tolerance-from-q11",
  run(ctx) {
    ctx.run("node", ["scripts/verify-factor-recon-tolerance-from-q11.mjs"]);
  },
};
