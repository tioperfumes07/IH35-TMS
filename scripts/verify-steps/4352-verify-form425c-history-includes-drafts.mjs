export default {
  name: "verify:form425c-history-includes-drafts",
  run(ctx) {
    ctx.run("node", ["scripts/verify-form425c-history-includes-drafts.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-form425c-history-includes-drafts.mjs"]);
    ctx.run("node", ["scripts/verify-form-425c-print-popup-blocked.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-form-425c-print-popup-blocked.mjs"]);
    ctx.run("node", ["scripts/verify-form425c-exhibits-no-stolen-prefix.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-form425c-exhibits-no-stolen-prefix.mjs"]);
    ctx.run("node", ["scripts/verify-form425c-save-draft-toasts.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-form425c-save-draft-toasts.mjs"]);
  },
};
