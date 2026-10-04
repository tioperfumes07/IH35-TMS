export default {
  name: "verify:dispatch-chat-error-honesty",
  run(ctx) {
    ctx.run("node", ["scripts/verify-dispatch-chat-error-honesty.mjs"]);
  },
};
