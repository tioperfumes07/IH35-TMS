export default {
  name: "verify:bank-recon-tolerance-from-q11",
  run(ctx) {
    ctx.run("node", ["scripts/verify-bank-recon-tolerance-from-q11.mjs"]);
  },
};
