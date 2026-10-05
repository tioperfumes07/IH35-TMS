export default {
  name: "verify:record-naming-cells-are-click-through",
  run(ctx) {
    ctx.run("node", ["scripts/verify-record-naming-cells-are-click-through.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-record-naming-cells-are-click-through.mjs"]);
  },
};
