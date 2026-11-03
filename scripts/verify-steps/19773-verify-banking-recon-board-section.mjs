export default {
  name: "verify-banking-recon-board-section",
  run(ctx) {
    ctx.run("node", ["scripts/verify-banking-recon-board-section.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-banking-recon-board-section.mjs"]);
  },
};
