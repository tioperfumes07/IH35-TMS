export default {
  name: "verify:dispatch-chat-attachment-upload-wired",
  run(ctx) {
    ctx.run("node", ["scripts/verify-dispatch-chat-attachment-upload-wired.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-dispatch-chat-attachment-upload-wired.mjs"]);
  },
};
