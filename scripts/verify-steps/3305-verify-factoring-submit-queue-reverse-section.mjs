// LINK-F5181 / LINK-F5171 — factoring:submit.queue reverse (customer + load) surface
// (verify-step 3305 — CC-1 band, claimed in #6825).
export default {
  name: "factoring-submit-queue-reverse-section",
  run(ctx) {
    ctx.run("node", ["scripts/verify-factoring-submit-queue-reverse-section.mjs", "--selftest"]);
    return ctx.run("node", ["scripts/verify-factoring-submit-queue-reverse-section.mjs"]);
  },
};
