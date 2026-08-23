export default {
  name: "verify:mdata-load-create-trailer-equipment-default",
  run(ctx) {
    ctx.run("node", ["scripts/verify-mdata-load-create-trailer-equipment-default.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-mdata-load-create-trailer-equipment-default.mjs"]);
  },
};
