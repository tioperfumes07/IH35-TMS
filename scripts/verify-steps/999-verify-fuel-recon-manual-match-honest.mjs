export default {
  name: "verify:fuel-recon-manual-match-honest",
  run(ctx) {
    ctx.run("node", ["scripts/verify-fuel-recon-manual-match-honest.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-fuel-recon-manual-match-honest.mjs"]);
  },
};
