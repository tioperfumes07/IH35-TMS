# GAP-70 — EDI Integration Foundation

**Block ID:** GAP-70  
**Wave:** P2-J · Lane B  
**Standards:** ANSI X12 4010/5010 transaction sets

## Overview

Foundation for broker EDI exchange supporting:

| Code | Name | Direction | Purpose |
|------|------|-----------|---------|
| 204 | Motor Carrier Load Tender | Inbound | Broker → TMS load tender |
| 214 | Transportation Carrier Shipment Status | Outbound | TMS → broker status updates |
| 210 | Motor Carrier Freight Details and Invoice | Outbound | TMS → broker freight invoice |
| 990 | Response to a Load Tender | Outbound | TMS acceptance/rejection of 204 |

## Schema

- `integrations.edi_partners` — partner ISA/GS IDs, connection type (AS2/FTP/SFTP/API), config JSONB
- `integrations.edi_messages` — raw X12 payload log with parse status and related load UUID

Both tables are tenant-scoped with RLS (`ih35_app`).

## API

- `POST /api/integrations/edi/partners` — register partner
- `GET /api/integrations/edi/partners` — list active partners
- `POST /api/integrations/edi/partners/:uuid/test-connection` — connectivity check
- `GET /api/integrations/edi/messages` — filterable message log
- `POST /api/integrations/edi/inbound` — receive 204 webhook
- `POST /api/integrations/edi/build/214` — build outbound status
- `POST /api/integrations/edi/build/210` — build outbound invoice

## UI

- `/integrations/edi/setup` — `EdiSetupWizard` multi-step partner onboarding
- `/integrations/edi/log` — `EdiTransactionLog` filterable message log + raw viewer

## Post-merge

Per-broker setup (CHRW, JBHT, TQL) requires cert exchange and partner-specific segment maps.
