export default {
  name: "verify:settled-load-carries-settled-status",
  run(ctx) {
    ctx.run("node", ["scripts/verify-settled-load-carries-settled-status.mjs"]);
  },
};
