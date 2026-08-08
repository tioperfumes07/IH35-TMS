export default {
  name: "verify:book-load-toast-server-status",
  run(ctx) {
    ctx.run("node", ["scripts/verify-book-load-toast-server-status.mjs"]);
  },
};
