export default {
  name: "verify:multi-entity-separation",
  run(ctx) {
    ctx.run("node", ["scripts/verify-multi-entity-separation.mjs"]);
  },
};
