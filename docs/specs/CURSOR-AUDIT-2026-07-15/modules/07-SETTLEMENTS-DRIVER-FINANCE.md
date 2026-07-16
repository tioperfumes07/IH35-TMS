# 07 — SETTLEMENTS / DRIVER FINANCE / ESCROW

**Verdict:** Canonical hub exists; recovery graph incomplete; dual engines; held posting columns.

## Surface inventory
| Surface | Route | Status |
|---------|-------|--------|
| Settlements list/detail | `/driver-finance/settlements?settlement_id=` | HAVE |
| Settlement Close | `/driver-finance/settlement-close` | HAVE |
| Cash advances | `/cash-advances`, requests | HAVE |
| Liabilities | `/liabilities` | HAVE |
| Escrow | Accounting + Banking + Safety Escrow Record | HAVE multi (KEEP) |
| Dispatch Settlements | stub quick-link | DRIFT |
| Create on Settlements page | — | MISSING |

## Connectivity
| Edge | Status |
|------|--------|
| Cash advance → liability + schedule | HAVE |
| Fine convert → liability | HAVE half |
| Liability → pending deduction | MISSING bridge |
| Contract-terms fine→deduction | Flag OFF + held mig |
| Bank categorize recover-from-driver | Code HAVE; flag OFF; consent gate |
| Expense form recover | NOT FOUND |
| Claim → settlement recovery | NOT FOUND |
| Settlement → bill/GL columns | Held `202607520000` |
| payroll.* INSERT | DRIFT / WILL FAIL collapse |

## WILL FAIL
Fine “will deduct next settlement” without deduction row; claim recovery absent; driver_id query dropped on `/settlements` redirect; posting drill-through blocked until held mig + flags.

## Professional recommendation
Seed deduction (or schedule) on fine→liability. Ship claim→receivable→settlement graph with held FKs (owner-gated). Collapse RETIRE payroll writer. Wire EntityLinks on settlement detail. Never delete escrow surfaces — add cross-links.

## Deep button inventory (repo) — 2026-07-15

**Primary surfaces:** `apps/frontend/src/pages/driver-finance/*` · `cash-advances/*` · `liabilities/*` · escrow multi-door · dispatch settlements stub

### Tabs / routes
| Control | File:line | Behavior | Status |
|---------|-----------|----------|--------|
| Settlements hub | `SettlementsPage.tsx:17` · `manifest.tsx:1978` | `?settlement_id=` selects detail | HAVE |
| Legacy `/settlements` redirect | `manifest.tsx:4084` | `<Navigate to="/driver-finance/settlements" replace />` **no search preserve** | WILL FAIL (drops `driver_id` etc.) |
| `/accounting/settlements` redirect | `manifest.tsx:4090` | Same bare Navigate | WILL FAIL query drop |
| Settlement Close | `SettlementCloseArrivalPage.tsx` · route under driver-finance | Close workflow | HAVE |
| Cash advance requests | `CashAdvanceRequestsPage.tsx:150` | `+ Create` toggle form | HAVE |
| Cash advances home | `cash-advances/CashAdvancesHome.tsx` | KPI + table | HAVE |
| Liabilities home | `liabilities/LiabilitiesHome.tsx` | List + drawer | HAVE |
| Escrow (Accounting) | `accounting/EscrowPage.tsx` | Escrow surface | HAVE — KEEP |
| Escrow (Banking) | `banking/.../DriverEscrowTabContent.tsx` | Banking tab | HAVE — KEEP |
| Escrow (Safety) | `safety/tabs/EscrowRecordTab.tsx` | Forfeit modal | HAVE — KEEP |
| Dispatch Settlements secondary tab | `Dispatch.tsx:487-497` | Quick-link only → driver-finance | DRIFT / STUB |

### Primary buttons
| Control | File:line | Behavior | Status |
|---------|-----------|----------|--------|
| SettlementsPage `+ Create` | `SettlementsPage.tsx` (grep: no Create) | No create CTA on hub | MISSING |
| Cash advance `+ Create` / Create request | `CashAdvanceRequestsPage.tsx:150,196-197` | Mutation create | HAVE |
| Settlement detail actions | `SettlementDetailPage.tsx` | Detail via `settlement_id` | HAVE |
| SettlementsTable driver link | `SettlementsTable.tsx:33` | `EntityLink kind="driver"` | HAVE |
| Disputes tab settlement link | `SettlementDisputesTab.tsx:191` | `EntityLink kind="settlement"` | HAVE |
| Fine → Convert to Driver Liability | `FineDetailDrawer.tsx:100-106` | Creates liability | HAVE (half-bridge) |
| Fine converted liability display | `FineDetailDrawer.tsx:86` · `InternalFinesPage.tsx:129` | Plain UUID string — no `EntityLink` | WILL FAIL drill-through |
| Fine bank payment banner | `FinePaymentLinkBanner.tsx:12-15` | Renders UUID text only | DEAD (no link) |

### Connectivity gaps
| Edge | File:line | Status |
|------|-----------|--------|
| Liability → pending settlement deduction UI | Not found in driver-finance UI this pass | MISSING / UNVERIFIED |
| Claim → settlement recovery UI | Not found | MISSING |
| Expense form recover-from-driver | Not found in expense create this pass | MISSING / UNVERIFIED |
| Bank categorize recover-from-driver | Banking DesignView (flag-gated elsewhere) | UNVERIFIED this file |

### Top WILL FAIL (new evidence)
1. **`/settlements?driver_id=` (and peers) lose query** — bare `Navigate` at `manifest.tsx:4084/4090`.
2. **Fine liability UUID is not clickable** — `FineDetailDrawer.tsx:86` / `InternalFinesPage.tsx:129` plain text; no liability `EntityKind`.
3. **No Create on Settlements hub** — operators cannot start a settlement from the canonical list page.

### Additional explorer evidence
| Control | File:line | Behavior | Status |
|---------|-----------|----------|--------|
| Profile “Full settlements” `?driver_id=` | `SettlementsSection.tsx:28-29` → redirect strips; page never reads `driver_id` | WILL FAIL |
| Deduction history → | `DebtBanner.tsx:36` | Underlined `<span>`, no handler | DEAD |
| Send acknowledgment requests | `PendingAckNotice.tsx:10` | Button, no `onClick` | DEAD |
| Save Draft (finalize) | `FinalizeBlock.tsx:32-40` | Always disabled | STUB |
| createSettlement API | `driverFinance.ts:122-124` | Zero UI callers | MISSING |
