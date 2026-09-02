# OWNER RULING — INSURANCE EXCLUDED UNITS (USMCA) · 2026-09-01

**Owner word (chat + lease exhibits):** These units **must NOT** appear on USMCA insurance policies (AL, APD, MTC).  
**Answered = closed.** Coders detach / never attach / exclude from APD TIV tie-out.

---

## A — Lease-to-own to 2EMS Transportation (TRANSP)

From **Lease-to-Own Asset Acquisition Agreement — IH 35 Trucking / 2EMS Transportation Inc.**

USMCA does not insure units under this lease-to-own path. Owner believes a prior attach mistake may have occurred — **corrected in insurance already** (verified live 2026-09-01: none of these on active CIMD/437539/437540).

| Unit | VIN | Notes (exhibit) |
|---|---|---|
| T144 | 1M1AN4GYXNM023603 | Page 8 schedule; leased_to **TRANSP** live |
| T162 | 1M1AN4GY4PM030386 | Page 8; leased_to **TRANSP** live |
| T167 | 1M1AN4GYXPM033356 | Page 8; leased_to **TRANSP** live |
| T169 | 1XPXD49X8PD892431 | Page 8; leased_to **TRANSP** live |

**Exhibit A (additional lease-to-own trucks — same rule):** T139, T140, T141, T143, T145, T146, T158, T159*, T165, T172 — *T159 also repossessed (§B).

---

## B — Repossessed tractors (remove / never attach)

| Unit | VIN | Repo | Lessor | Live status |
|---|---|---|---|---|
| T159 | 1M1AN4GY3NM030263 | **Aug 2025** | Auxilior | InService, leased TRANSP — **exclude** |
| T160 | 1M1AN4GY3PM030265 | **Jul 2025** | Mitsubishi | OutOfService, leased USMCA — **exclude** |
| T161 | 1M1AN4GY2PM030385 | **Jul 2025** | Mitsubishi | OutOfService, leased USMCA — **exclude** |

---

## C — Repossessed trailers (Aug 2025 · Auxilior)

| Owner # | Make | VIN | TMS equipment | APD schedule |
|---|---|---|---|---|
| 10873 | Wabash Reefer 2016 | 1JJV532B6GL965873 | **not in DB** | exclude if imported |
| 10876 | Wabash Reefer 2016 | 1JJV532B1GL965876 | **USMCA-APD-31** | was APD #31 $13,500 — **exclude** |
| 10456 | Utility Reefer 2016 | 1UYVS2530GM762456 | **not in DB** | exclude if imported |

---

## D — CC-1 build impact

1. **Do NOT** create USMCA `mdata.assets` or `policy_unit` rows for §A–§C units.
2. **APD TIV tie-out** ($1,077,940 on signed quote) must **subtract** excluded tractor/trailer ACVs if those VINs were on the binder PDF but owner has ruled them out — recalc and paste new sum; flag delta to owner if binder still lists them.
3. **T144** — no longer a “attach to USMCA” defect; rule is **exclude** (2EMS lease-to-own).
4. **T156 / T174 / T163** — still per GO file (T163 attach OK; T156 Sold; T174 build asset).

---

## E — Live proof (2026-09-01, bypass RLS)

Active USMCA policies CIMD-2026-0720, 437539, 437540 each carry **11 units** (T147,T148,T152,T164,T168,T170,T171,T173,T175,T176,T177).  
**None** of §A–§C units appear on `insurance.policy_unit` for those policies.
