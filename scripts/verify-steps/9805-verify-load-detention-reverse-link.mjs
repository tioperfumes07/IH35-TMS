export default {
  name: "verify-load-detention-reverse-link",
  run(ctx) {
    if (ctx.run("node", ["scripts/verify-load-detention-reverse-link.mjs"]) !== 0) {
      throw new Error("verify-load-detention-reverse-link failed");
    }
  },
};
