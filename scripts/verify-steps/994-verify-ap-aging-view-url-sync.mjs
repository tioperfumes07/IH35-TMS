export default {
  name: "verify:ap-aging-view-url-sync",
  run(ctx) {
    ctx.run("node", ["scripts/verify-ap-aging-view-url-sync.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-ap-aging-view-url-sync.mjs"]);
  },
};
