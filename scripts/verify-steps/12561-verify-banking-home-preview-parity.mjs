export default {
  name: "verify:banking-home-preview-parity",
  run(ctx) {
    ctx.run("node", ["scripts/verify-banking-home-preview-parity.mjs"]);
    // Pending row 38 — Banking Home bare panels → BoardSection
    ctx.run("node", ["scripts/verify-banking-home-boards.mjs"]);
  },
};
