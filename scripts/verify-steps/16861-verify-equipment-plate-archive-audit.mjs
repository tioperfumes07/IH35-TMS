export default {
  name: "verify:equipment-plate-archive-audit",
  run(ctx) {
    ctx.run("node", ["scripts/verify-equipment-plate-archive-audit.mjs"]);
  },
};
