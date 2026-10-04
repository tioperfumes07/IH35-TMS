export default {
  name: "verify:xlsx-upload-magic-bytes",
  run(ctx) {
    ctx.run("node", ["scripts/verify-xlsx-upload-magic-bytes.mjs"]);
  },
};
