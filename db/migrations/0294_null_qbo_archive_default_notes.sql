-- Block AB: remove projected qbo_archive default notes payload from customers

-- UP
UPDATE mdata.customers
SET notes = NULL
WHERE notes = 'Projected from qbo_archive.entities_snapshot (TRANSP realm 123145885549599)';

-- DOWN
-- no-op: data cleanup migration
