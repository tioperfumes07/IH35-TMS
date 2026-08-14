// LINK-F5179 / LINK-F5171 — factoring:dispatch.queue reverse (customer + load) surface
// (verify-step 3297 — CC-1 band, claimed in #6799).
export default {
  name: "factoring-dispatch-queue-reverse-section",
  run(ctx) {
    ctx.run("node", ["scripts/verify-factoring-dispatch-queue-reverse-section.mjs", "--selftest"]);
    return ctx.run("node", ["scripts/verify-factoring-dispatch-queue-reverse-section.mjs"]);
  },
};
