// Register row 59 (Lead 443.301): Maintenance › In Shop = bay board. Bay layout follows the company setting
// (backend layoutBays) and the board renders bays + yard lane + Ready/Working/Waiting parts. Claimed 18737 (LEAD).
export default {
  name: "verify-maintenance-in-shop-bays",
  async run(ctx) {
    await ctx.run("npx", ["vitest", "run", "apps/backend/src/maintenance/__tests__/shop-bays-layout.test.ts"]);
    await ctx.run("npx", ["vitest", "run", "--root", "apps/frontend", "src/pages/maintenance/components/InShopBoard.test.tsx"]);
  },
};
