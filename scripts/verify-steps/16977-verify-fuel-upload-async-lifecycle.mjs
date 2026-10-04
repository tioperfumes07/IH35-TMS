export default {
  name: "verify:fuel-upload-async-lifecycle",
  run(ctx) {
    ctx.run("node", ["scripts/verify-fuel-upload-async-lifecycle.mjs"]);
  },
};
