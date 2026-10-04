export default {
  name: "verify-wo-create-part-task-required",
  async run(ctx) {
    ctx.run("node", ["scripts/verify-wo-create-part-task-required.mjs"]);
    ctx.run("node", ["scripts/verify-wo-create-part-task-required.mjs", "--selftest"]);
    // BANK-F91509 + BANK-F91513 — CreateWorkOrderModal leftover #94a3b8/#475569/#aab6cd refuse.
    // BANK-F91523 — leftover SVG/help border #cbd5e1 → house #E5E7EB.
  },
};
