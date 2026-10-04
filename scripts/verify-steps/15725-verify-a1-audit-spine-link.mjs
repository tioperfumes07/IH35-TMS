export default {
  name: "verify:a1-audit-spine-link",
  run(ctx) {
    ctx.run("node", ["scripts/verify-a1-audit-spine-link.mjs"]);
  },
};
