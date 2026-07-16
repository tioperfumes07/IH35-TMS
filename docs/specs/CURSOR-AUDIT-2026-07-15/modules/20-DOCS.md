# 20 — DOCS

**Verdict:** Two document libraries coexist — Owner/Admin `/docs` (entity foundation + **+ Upload Document**) and `/documents` (“All Documents”, CTA **Upload document** without +). Arch MODULE 11’s 10 tabs (Email Inbox, OCR, Legal Hold, R2 stats, Settings) are largely not present as sub-nav on `/docs`.

## Live evidence notes
**REPO-ONLY.**
- Sidebar DOCS → `/docs` Owner/Admin only (`sidebar-config.ts` L121; `OwnerAdminRoute` manifest L909–914)
- Parallel: `/documents` → `DocumentsPage` (manifest L900–906)
- `/docs` page: `apps/frontend/src/pages/docs/DocsHomePage.tsx`
- Arch MODULE 11: L628–654

## Surface / button inventory

| Surface | Control | Route/behavior | Status |
|---------|---------|----------------|--------|
| Sidebar DOCS | Nav | `/docs` (Owner/Admin) | HAVE |
| `/docs` header | **+ Upload Document** | `UploadModal` with companyId | HAVE |
| `/docs` KPI | Total Docs | Resets filters | HAVE |
| `/docs` KPI | Expiring 30 Days | Sets expires_before | HAVE |
| `/docs` KPI | Missing Required | Display only | WILL FAIL (dead click — code comment B10) |
| `/docs` KPI | Recent Uploads | Display only | WILL FAIL (dead click — B10) |
| `/docs` tabs | All Entities / Drivers / Customers / Vendors / Units / Equipment | Entity filter | HAVE (≠ design 10 tabs) |
| `/docs` | Type filter / Expiration before / Reset | | HAVE |
| `/docs` empty | **+ Upload Document** | | HAVE |
| `/documents` | **Upload document** | UploadModal; Owner/Admin gate | DRIFT vocab (+ missing); dual library |
| Design tabs | By Category, Pending Review, Email Inbox, OCR, Expiring, FMCSA queue, Legal Hold, R2 Stats, Settings | Design L638–651 | MISSING as `/docs` sub-nav |
| Design KPI | MTD Uploaded / Pending Review / Storage GB | | MISSING / partial |

## Connectivity to money/ops
- Entity tabs scope files to driver/customer/vendor/unit/equipment — good ops linkage.
- Customer/Vendor detail Documents tabs are separate surfaces — must stay reachable.
- No EntityLink from doc rows to parent entity verified on DocsHomePage table (file-centric).

## HAVE / MISSING / DRIFT / WILL FAIL
**HAVE:** + Upload Document on `/docs`; entity filters; expiration filter; company-scoped upload fix.
**MISSING:** MODULE 11 tabs (Email Inbox, OCR Results, Legal Hold, R2, Settings, FMCSA queue as docs hub).
**DRIFT:** Dual `/docs` vs `/documents`; Upload vocab inconsistency; entity tabs ≠ design category tabs.
**WILL FAIL:** Missing Required / Recent Uploads KPI cards look clickable but do nothing.

## Professional recommendation
Keep both `/docs` and `/documents` (never delete). Make `/documents` an alias or labeled “Company library” under Docs sub-nav. Fix KPI dead clicks or remove click affordance. Ship Pending Review / Expiring / Legal Hold as additive tabs before claiming MODULE 11 complete. Link each file row to EntityLink for its entity_id.

## Deep button inventory (repo) — finish pass 2026-07-15

**Evidence root:** `apps/frontend/src/pages/docs/DocsHomePage.tsx` · `apps/frontend/src/pages/Documents.tsx` · sidebar `sidebar-config.ts:121`

### Dual libraries (KEEP both)
| Surface | File:line | Behavior | Status |
|---------|-----------|----------|--------|
| Sidebar DOCS | `sidebar-config.ts:121` | `/docs` Owner/Admin | HAVE |
| `/docs` **+ Upload Document** | `DocsHomePage.tsx:77-83,187-190` | `UploadModal` + `operatingCompanyId` | HAVE |
| `/documents` **Upload document** | `Documents.tsx:126-129` | No leading `+`; Owner/Admin gate `:57,114-115` | DRIFT vocab / dual door |

### KPI strip (dead clicks)
| Control | File:line | Behavior | Status |
|---------|-----------|----------|--------|
| Total Docs | `DocsHomePage.tsx:107-116` | Resets filters | HAVE |
| Expiring 30 Days | `DocsHomePage.tsx:117-125` | Sets `expires_before` | HAVE |
| Missing Required | `DocsHomePage.tsx:126` · comment `:102-105` | No `onClick` — intentional B10 | WILL FAIL (looks clickable via KpiCard chrome) |
| Recent Uploads | `DocsHomePage.tsx:127` | No `onClick` | WILL FAIL |
| KpiCard click affordance | `DocsHomePage.tsx:243-254` | Button styling only when `onClick` set | HAVE (partial) |

### Filters / tabs
| Control | File:line | Behavior | Status |
|---------|-----------|----------|--------|
| Entity tabs | `DocsHomePage.tsx:130-137` | All / Drivers / Customers / Vendors / Units / Equipment | HAVE (≠ design 10 tabs) |
| Type / Expiration / Reset | `DocsHomePage.tsx:141-175` | Local filters | HAVE |
| Design Email Inbox / OCR / Legal Hold / R2 / Settings | Not on `/docs` | | MISSING |

### Top WILL FAIL (new evidence)
1. **Missing Required / Recent Uploads KPI cards do nothing** — `DocsHomePage.tsx:126-127` + B10 comment.
2. **Operators confuse `/docs` vs `/documents`** — dual upload vocab (`+ Upload Document` vs `Upload document`).
3. **MODULE 11 training tabs (OCR, Legal Hold, etc.) not findable** under Docs door.

**Never delete** `/docs` or `/documents` — label/alias and fix dead KPIs only.
