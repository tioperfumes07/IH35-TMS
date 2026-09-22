# 89-row live audit — driver_finance.driver_settlements, USMCA, 2026-09-23

Live query, this session, against Neon project tiny-field-89581227 / branch br-fancy-credit-akjnd07a,
`app.bypass_rls='lucia'`, `operating_company_id='5c854333-6ea5-4faa-af31-67cb272fef80'`, ordered by
`created_at ASC`. `match` = `display_id = 'S-2026-' || lpad(source_document_ref,4,'0')`.

**Summary: 89 total — 42 numeric-match, 25 diverged, 21 no-ref (null source_document_ref), 1 void-shell.**

Ever shown outside the app: no. `scripts/verify-settlement-ref-beside-load.mjs` (pre-existing, CC-2-
authored, wired into the local gate) asserts live that 0 frontend files render `display_id` or an
`S-YYYY-NNNN` counter as the user-visible settlement number — every surface renders
`source_document_ref` instead. Backend PDF/render routes checked
(`company-settlement-render.routes.ts`) render a different table's own id
(`accounting.company_settlements`, `CS-YYYY-NNNN` scheme) — not this one.

| # | id | display_id | source_document_ref | status | match |
|---|---|---|---|---|---|
| 1 | dac3e8ac | S-2026-0001 | 5773 | cancelled | ✗ |
| 2 | 2c1d92fa | S-2026-0006 | 5784 | cancelled | ✗ |
| 3 | 67ad9ed4 | S-2026-0005 | 5775 | cancelled | ✗ |
| 4 | f0ba9de4 | S-2026-0009 | 5783 | cancelled | ✗ |
| 5 | 3c81e7d5 | S-2026-0013 | 5779 | cancelled | ✗ |
| 6 | 1f9b8542 | S-2026-0010 | 5776 | cancelled | ✗ |
| 7 | c7edc017 | S-2026-0011 | 5782 | closed | ✗ |
| 8 | 8c7afab1 | S-2026-0012 | 5785 | cancelled | ✗ |
| 9 | 6cd53f62 | S-2026-0002 | (null) | cancelled | — |
| 10 | 440992d4 | S-2026-0003 | (null) | cancelled | — |
| 11 | 1f67ae0f | S-2026-0015 | (null) | cancelled | — |
| 12 | ab3697bd | S-2026-0004 | (null) | cancelled | — |
| 13 | 4ae11649 | S-2026-0008 | 5772 | cancelled | ✗ |
| 14 | 28f4c094 | S-2026-0014 | 5780 | cancelled | ✗ |
| 15 | 6ce5561b | S-2026-0016 | (null) | cancelled | — |
| 16 | 27c304e2 | S-2026-0007 | (null) | cancelled | — |
| 17 | 51e82b62 | S-2026-0017 | (null) | cancelled | — |
| 18 | 0b055c48 | S-2026-0018 | (null) | closed | — |
| 19 | 68bfd169 | S-2026-0019 | (null) | closed | — |
| 20 | f820d05c | S-2026-0020 | (null) | closed | — |
| 21 | 0a17f83b | S-2026-0021 | (null) | cancelled | — |
| 22 | 035cbd68 | S-2026-0022 | (null) | closed | — |
| 23 | 2ed4116a | S-2026-0023 | (null) | closed | — |
| 24 | 1c718205 | S-2026-0024 | (null) | cancelled | — |
| 25 | f2ec92f4 | S-2026-0025 | (null) | closed | — |
| 26 | a2b54cb7 | S-2026-0026 | (null) | cancelled | — |
| 27 | f391b502 | S-2026-0027 | (null) | cancelled | — |
| 28 | fe07244f | S-2026-0028 | (null) | closed | — |
| 29 | 9fc96d89 | S-2026-0029 | (null) | closed | — |
| 30 | 0a8aa2aa | S-2026-0030 | (null) | closed | — |
| 31 | 9bdfa86e | S-2026-0031 | (null) | closed | — |
| 32 | 75544ad7 | S-2026-5775 | 5775 | locked | ✓ |
| 33 | 52c7977b | S-2026-5787 | 5787 | locked | ✓ |
| 34 | 0c77ef0b | S-2026-5769 | 5769 | locked | ✓ |
| 35 | 9007277f | S-2026-5788 | 5788 | locked | ✓ |
| 36 | 72c226b3 | S-2026-5773 | 5773 | locked | ✓ |
| 37 | 248b52e7 | S-2026-5786 | 5786 | locked | ✓ |
| 38 | 553170bd | S-2026-5797 | 5797 | locked | ✓ |
| 39 | 1e829d5e | S-2026-5785 | 5785 | locked | ✓ |
| 40 | b6df9d73 | S-2026-5792 | 5792 | locked | ✓ |
| 41 | 4d37edff | S-2026-5798 | 5798 | locked | ✓ |
| 42 | fc8d8883 | S-2026-5778 | 5778 | locked | ✓ |
| 43 | f9a10c1b | S-2026-5782 | 5782 | locked | ✓ |
| 44 | 262255a1 | S-2026-5791 | 5791 | locked | ✓ |
| 45 | 8bde894a | S-2026-5771 | 5771 | locked | ✓ |
| 46 | 2de6b148 | S-2026-5777 | 5777 | locked | ✓ |
| 47 | 30ef24ec | S-2026-5783 | 5783 | locked | ✓ |
| 48 | 47111c9f | S-2026-5789 | 5789 | locked | ✓ |
| 49 | afe1e6c0 | S-2026-5799 | 5799 | locked | ✓ |
| 50 | abfcb9a0 | S-2026-5774 | 5774 | locked | ✓ |
| 51 | 4d0be999 | S-2026-5784 | 5784 | locked | ✓ |
| 52 | d6acb0c6 | S-2026-5796 | 5796 | locked | ✓ |
| 53 | c594a5c6 | S-2026-5794 | 5794 | locked | ✓ |
| 54 | 73074d91 | S-2026-5776 | 5776 | locked | ✓ |
| 55 | b07fa3d0 | S-2026-5781 | 5781 | locked | ✓ |
| 56 | e68626d4 | S-2026-5790 | 5790 | locked | ✓ |
| 57 | 11867eba | S-2026-5779 | 5779 | locked | ✓ |
| 58 | 41c422bb | S-2026-5795 | 5795 | locked | ✓ |
| 59 | e9788f64 | S-2026-5770 | 5770 | locked | ✓ |
| 60 | 4a2033d0 | S-2026-5793 | 5793 | locked | ✓ |
| 61 | 6a267f30 | S-2026-5772 | 5772 | locked | ✓ |
| 62 | 3cfa93bb | S-2026-5780 | 5780 | locked | ✓ |
| 63 | 1104c9f4 | S-2026-5800 | 5800 | locked | ✓ |
| 64 | 11feca63 | S-2026-5801-VOID-11feca63 | (null) | cancelled | — |
| 65 | 3f67ff6b | S-2026-5803 | 5803 | locked | ✓ |
| 66 | 2e1dad71 | S-2026-5802 | 5802 | locked | ✓ |
| 67 | c0fdcc2a | S-2026-5801 | 5801 | locked | ✓ |
| 68 | 63a8333b | S-2026-5808 | 5808 | closed | ✓ |
| 69 | 6a8ecf55 | S-2026-5805 | 5805 | closed | ✓ |
| 70 | 89c90396 | S-2026-5807 | 5807 | open | ✓ |
| 71 | 48341005 | S-2026-5804 | 5804 | closed | ✓ |
| 72 | f5305500 | S-2026-5806 | 5806 | closed | ✓ |
| 73 | 4db66351 | S-2026-5809 | 5809 | closed | ✓ |
| 74 | f074c0c9 | S-2026-5810 | 5810 | open | ✓ |
| 75 | 00027149 | S-2026-5811 | 5815 | open | ✗ |
| 76 | bbc27108 | S-2026-5812 | 5816 | closed | ✗ |
| 77 | e1bfb565 | S-2026-5813 | 5817 | closed | ✗ |
| 78 | 32838c2f | S-2026-5814 | 5818 | closed | ✗ |
| 79 | 9957827a | S-2026-5815 | 5819 | open | ✗ |
| 80 | 153b58e7 | S-2026-5816 | 5820 | open | ✗ |
| 81 | 8f19042a | S-2026-5817 | 5821 | open | ✗ |
| 82 | 650313f8 | S-2026-5818 | 5822 | open | ✗ |
| 83 | afd285b1 | S-2026-5819 | 5823 | open | ✗ |
| 84 | ba1fcfe8 | S-2026-5820 | 5824 | open | ✗ |
| 85 | 32770d8c | S-2026-5821 | 5825 | open | ✗ |
| 86 | 222c0d6b | S-2026-5822 | 5811 | closed | ✗ |
| 87 | 63145f15 | S-2026-5823 | 5812 | closed | ✗ |
| 88 | e47e64e2 | S-2026-5824 | 5813 | closed | ✗ |
| 89 | d00faf77 | S-2026-5825 | 5814 | closed | ✗ |

Highest live `source_document_ref` right now: **5825**. `allocateNextSettlementSourceDocumentRef`
(floor 5803, `GREATEST(5803, MAX(source_document_ref::int))+1`) would mint **5826** next — always
computed live at call time, never hardcoded, so it stays correct as the sequence keeps growing.
