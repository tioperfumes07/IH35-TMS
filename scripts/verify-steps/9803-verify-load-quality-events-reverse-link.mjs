export default {
  name: "verify-load-quality-events-reverse-link",
  run(ctx) {
    if (ctx.run("node", ["scripts/verify-load-quality-events-reverse-link.mjs"]) !== 0) {
      throw new Error("verify-load-quality-events-reverse-link failed");
    }
  },
};
