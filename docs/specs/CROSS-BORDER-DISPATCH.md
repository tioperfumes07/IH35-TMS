# IH35-TMS — Cross-Border Dispatch (Laredo Corridor)
**LOCKED 2026-06-07 | IH35-specific — Laredo ↔ Mexico operations**

## Corridors
Primary: Laredo, TX ↔ Monterrey / Saltillo / Silao / Mexico City
Crossings: World Trade Bridge · Colombia Solidarity Bridge · Pharr-Reynosa International

## Required Documents Per Load Direction

### Northbound (Mexico → USA)
- Rate Confirmation
- Bill of Lading (BOL)
- USMCA Certificate of Origin (if USMCA-eligible goods)
- Customs Broker: assigned at booking
- Crossing: World Trade / Colombia / Pharr

### Southbound (USA → Mexico)
- Rate Confirmation  
- PITA Permit (Permiso Individual de Travesía Aduanera)
- SCT Cargo Permit
- USMCA Certificate of Origin
- Pedimento Number (assigned by customs broker)
- Customs Broker: assigned at booking
- Crossing: World Trade / Colombia / Pharr

## Document Compliance Gate
Before dispatch is confirmed:
- Check all required documents are present for direction (NB/SB)
- Missing docs: WARN + block dispatch (dispatcher can override with reason logged)
- Missing docs + no override: cannot change status to 'assigned'

## Border Wait Time Tracking
- Source: geo.geofence_events (is_border_crossing = true)
- Wait = crossing_in_at → crossing_out_at
- Running average per crossing per week
- Show on: dispatch board ETA card + geofence timeline

## Customs Broker Integration
- Broker assigned per load at booking
- Broker name, contact, Pedimento number stored on load
- Pedimento links to customs clearance event in audit trail

## NB/SB Trip Linking
- Same as pre-settlement: NB load + SB return = one trip
- Trip = NB load + border crossing + SB load
- Company Settlement Report = per trip (NB + SB + border costs)

## USMCA July 2026 Launch
- USMCA company entity supports these operations
- Multi-carrier: TRANSP handles domestic; USMCA handles cross-border
- Both visible in same dispatch board with company filter
