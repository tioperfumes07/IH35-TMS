# EMAIL SWAP RESTORE — 2026-08-31

Owner ordered: replace billing_email for Aug-invoiced customers that would transmit.
Cursor applied via Neon (`app.bypass_rls=lucia`) to USMCA only. **ap_email left NULL.**

| customer_id | customer | old billing_email | new |
|-------------|----------|-------------------|-----|
| 411b2172-56dc-483f-b07e-991a21ac4793 | CORE LOGISTICS BROKERAGE | POD@SHIPWITHCORE.COM | jpm@tioperfumes.com |
| d934b8b2-ad1b-4dba-ae61-907afdc9223a | FLS TRANSPORTATION SERVICES LIMITED | POD@FLSTRANSPORT.COM | jpm@tioperfumes.com |
| 736e3124-8bc1-4ccd-973b-b97ecf0b92f8 | ITS Logistics LLC | carriers@itsnational.com | jpm@tioperfumes.com |
| 348907b7-8323-42fd-8138-889238bebdb5 | OSTT LOGISTICS LLC | osttbrokeragellc@gmail.com | jpm@tioperfumes.com |
| 1d1f8b21-3ea6-423e-8ced-af0c2b6a21fb | PFL Logistics LLC | invoices@pfllogistic.com | jpm@tioperfumes.com |
| 66870aae-6255-4e6a-95aa-386146ee76e6 | R2X LLC | R2XPAPERWORK@R2XLLC.COM | jpm@tioperfumes.com |
| cfc5f1dc-7945-46dd-b16c-569d456e3d13 | Rehmann Transportation Corp. | ap@rtctransportation.com | jpm@tioperfumes.com |

Restore after E2E testing (UI or SQL): set billing_email back to **old** column values above.
