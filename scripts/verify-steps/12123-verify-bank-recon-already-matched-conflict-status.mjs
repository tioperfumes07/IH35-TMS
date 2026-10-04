export default {
  name: "verify:bank-recon-already-matched-conflict-status",
  run(ctx) {
    ctx.run("node", ["scripts/verify-bank-recon-already-matched-conflict-status.mjs"]);
  },
};
