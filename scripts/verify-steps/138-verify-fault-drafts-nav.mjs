export default {
  name: "verify-fault-drafts-nav",
  run(ctx) {
    // Literal path so verify:guard-wired sees verify-fault-drafts-nav.mjs in the steps corpus
    if (ctx.run("node", ["scripts/verify-fault-drafts-nav.mjs"]) !== 0) {
      throw new Error("verify:fault-drafts-nav failed");
    }
  },
};
