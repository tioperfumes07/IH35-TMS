// 1550-verify-create-surface-is-drawer — C7 (CHROME: create surfaces use the shared drawer).
//
// Every "+ Create"/"+ Book" surface must open the shared 480px RIGHT DRAWER variant of
// apps/frontend/src/components/Modal.tsx — not the centered card. Run against pre-fix origin/main
// this FAILS with 73 problems: the `variant` prop and the 480px token do not exist yet, and 65
// create surfaces are centered modals.
//
// The two owner-ratified WIDE WIZARDS (Book Load, Create Work Order) are asserted to STAY wide
// wizards — a reverse ratchet, so nobody drawer-ises them either — and each must carry the
// C7-WIDE-WIZARD-EXCEPTION annotation in its own source.
//
// The --selftest runs FIRST and plants 23 defects (a centered create surface, a brand-new centered
// create surface, a legacy-vocabulary title, a ternary create/edit title, a prop-titled create
// surface, a deleted drawer variant, a flipped default, a de-anchored drawer, a drifted width
// token, a widened 480 token, a deleted legacy token, a removed focus trap / Escape / unsaved
// guard, an a11y gate behind `variant`, a lost portal, a demoted z-index, a drawer-ised exception,
// a stripped annotation, a renamed exception file, two vanished files) plus two classifier
// controls proving it does NOT claim confirm/success modals. Every assertion is proven capable of
// failing before the real tree is judged.
export default {
  name: "verify-create-surface-is-drawer",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-create-surface-is-drawer.mjs", "--selftest"]);
    return ctx.run("node", ["scripts/verify-create-surface-is-drawer.mjs"]);
  },
};
