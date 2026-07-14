// DISPATCH module fix pass (master-sequence item 6, 2026-07-14) guard wired into verify:pre-commit.
// Fails if a color-emoji/warning glyph (⚠ 📡 🟢🔵🟡🟠🔴🟣⚫⚪) or an off-palette hex (#16203a / #A32D2D)
// is reintroduced anywhere under apps/frontend/src/{pages,components}/dispatch.
export default {
  name: "no-emoji-in-dispatch-chrome",
  run: async (ctx) => {
    if (ctx.run("npm", ["run", "verify:no-emoji-in-dispatch-chrome"]) !== 0) {
      process.exit(1);
    }
  },
};
