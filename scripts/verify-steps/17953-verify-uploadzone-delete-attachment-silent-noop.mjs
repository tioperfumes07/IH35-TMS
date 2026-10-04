export default {
  name: "verify:uploadzone-delete-attachment-silent-noop",
  run(ctx) {
    ctx.run("node", ["scripts/verify-uploadzone-delete-attachment-silent-noop.mjs"]);
  },
};
