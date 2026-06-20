# Fuel

The Fuel module (FUEL) records diesel purchases and roadside fuel-related expenses, and ties each one to the load it was burned on so that cost-per-load and profitability stay accurate.

## Overview
Every diesel and roadside expense in the system is linked to a load. That linkage is a hard rule: it is what lets the carrier see true cost per mile and per load, and it keeps fuel spend reconcilable against the trips that generated it.

## Key tasks
- **Record a fuel purchase** — enter the diesel expense and select the load it belongs to.
- **Log a roadside expense** — capture roadside/over-the-road fuel-related costs the same way, against the relevant load.
- **Import fuel data** — bring in fuel-card or vendor fuel records, then reconcile each line to a load.
- **Review fuel by load** — fuel cost flows into the load's economics so dispatch and accounting see the real margin.

## Tips & gotchas
- **Every diesel/roadside expense must be attached to a load.** An unlinked fuel expense is incomplete and will not reflect correctly in profitability — always pick the load.
- Fuel cost is part of the load's true cost; getting the load linkage right is what makes per-load margin trustworthy.

## FAQ
- **Why do I have to pick a load for every fuel entry?** Because fuel is a load cost. Tying it to a load is how the system computes accurate cost-per-load and protects margin reporting.
- **Where do shop repairs go instead?** Repairs and parts belong in the Maintenance module as work orders, not here.
