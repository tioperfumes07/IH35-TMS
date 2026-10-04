export default {
  name: "verify:chat-schema-integrity",
  run(ctx) {
    ctx.run("node", ["scripts/verify-chat-schema-integrity.mjs"]);
  },
};
