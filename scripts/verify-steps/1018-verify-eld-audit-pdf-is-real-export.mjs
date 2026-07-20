export default {
  name: "verify:eld-audit-pdf-is-real-export",
  run(ctx) {
    ctx.run("node", ["scripts/verify-eld-audit-pdf-is-real-export.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-eld-audit-pdf-is-real-export.mjs"]);
  },
};
