export default {
  name: "verify-legal-matter-event-body-readable",
  run(ctx) {
    if (ctx.run("node", ["scripts/verify-legal-matter-event-body-readable.mjs"]) !== 0) {
      throw new Error("verify-legal-matter-event-body-readable failed");
    }
  },
};
