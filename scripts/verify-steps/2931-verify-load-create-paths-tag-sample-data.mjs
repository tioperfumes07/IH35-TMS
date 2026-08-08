export default {
  name: "verify:load-create-paths-tag-sample-data",
  run(ctx) {
    ctx.run("node", ["scripts/verify-load-create-paths-tag-sample-data.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-load-create-paths-tag-sample-data.mjs"]);
  },
};
