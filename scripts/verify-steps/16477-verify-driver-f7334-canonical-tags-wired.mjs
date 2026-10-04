export default {
  name: "verify:driver-f7334-canonical-tags-wired",
  run(ctx) {
    ctx.run("node", ["scripts/verify-driver-f7334-canonical-tags-wired.mjs"]);
  },
};
