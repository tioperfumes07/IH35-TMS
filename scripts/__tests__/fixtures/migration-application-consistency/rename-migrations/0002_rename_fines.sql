BEGIN;

ALTER TABLE safety.fines RENAME TO liability_fines;

COMMIT;
