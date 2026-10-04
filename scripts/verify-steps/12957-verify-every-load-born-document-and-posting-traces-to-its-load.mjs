export default {
  name: "verify:every-load-born-document-and-posting-traces-to-its-load",
  run(ctx) {
    ctx.run("node", ["scripts/verify-every-load-born-document-and-posting-traces-to-its-load.mjs"]);
  },
};
