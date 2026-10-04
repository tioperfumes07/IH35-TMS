export default {
  name: "verify:ratecon-upload-load-link",
  run(ctx) {
    ctx.run("node", ["scripts/verify-ratecon-upload-load-link.mjs"]);
  },
};
