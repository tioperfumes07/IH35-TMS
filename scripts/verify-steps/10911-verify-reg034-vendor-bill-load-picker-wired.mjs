export default {
  name: "verify:reg034-vendor-bill-load-picker-wired",
  run(ctx) {
    ctx.run("node", ["scripts/verify-reg034-vendor-bill-load-picker-wired.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-reg034-vendor-bill-load-picker-wired.mjs"]);
  },
};
