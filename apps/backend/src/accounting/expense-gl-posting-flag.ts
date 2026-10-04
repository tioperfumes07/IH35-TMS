// The ONE definition of the expense GL-posting feature-flag key. It used to live in expenses.routes.ts, which services
// could not import without dragging the HTTP auth middleware and session provider in, so four services each re-typed the
// literal (fuel posting, tour close, the work-order two-section service, check create). One key, one place (CC-2 2026-10-04).
export const EXPENSE_GL_POSTING_FLAG_KEY = "EXPENSE_GL_POSTING_ENABLED";
