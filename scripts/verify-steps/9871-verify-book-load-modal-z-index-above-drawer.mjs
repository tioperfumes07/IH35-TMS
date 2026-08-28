// verify-steps wrapper for scripts/verify-book-load-modal-z-index-above-drawer.mjs —
// BOOK-LOAD-MODAL-INVISIBLE-BEHIND-DRAWER: BookLoadModalV4's Edit-from-LoadDetailDrawer path must
// render above the drawer's own z-[210] panel, not behind it. Static, no DB.
export default {
  name: "verify-book-load-modal-z-index-above-drawer",
  run(ctx) {
    ctx.run("node", ["scripts/verify-book-load-modal-z-index-above-drawer.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-book-load-modal-z-index-above-drawer.mjs"]);
  },
};
