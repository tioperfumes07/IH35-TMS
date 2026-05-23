# QBO Customers Sync Chain

## Implemented Chain (Current State)

```text
mdata.qbo_customers create/update (Office write route)
  -> enqueue outbox.events event_type=qbo.master_entity.push_requested
     payload includes { operating_company_id, mirror_row_id, entity=customer, operation }
  -> outbox processor claims event
  -> outbox handler (qbo-master-entity-push.handler) validates payload UUIDs
  -> qbo/push.service applies tenant context and loads mirror row by
     (id, operating_company_id)
  -> QBO API create/update customer call
  -> mirror row update constrained by (id, operating_company_id, qbo_id)
```

## Related Sync-Runs Path (Scheduled/Manual Pull Sync)

```text
qbo/master-data-sync.service syncCustomers()
  -> reads QBO Customer pages
  -> upserts mdata.qbo_customers by (operating_company_id, qbo_id)
  -> writes mdata.qbo_sync_runs with operating_company_id
```

## Tenant-Scope Invariants

1. Outbox customer push payload must include `operating_company_id`.
2. Handler must read `operating_company_id` from payload before any DB read.
3. Mirror customer lookups/updates must include `operating_company_id`.
4. `mdata.qbo_sync_runs` writes must include `operating_company_id`.
5. Cross-tenant outbox payloads must not resolve mirror rows outside the payload tenant.

## Gap Found (Future-State)

Direct `mdata.customers -> outbox -> qbo worker` customer sync is **not currently implemented**.
Current customer push path is based on `mdata.qbo_customers`.
