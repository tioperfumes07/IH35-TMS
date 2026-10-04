export default {
  name: "verify:bank-recon-variance-uses-q8",
  run(ctx) {
    ctx.run("node", ["scripts/verify-bank-recon-variance-uses-q8.mjs"]);
  },
};
