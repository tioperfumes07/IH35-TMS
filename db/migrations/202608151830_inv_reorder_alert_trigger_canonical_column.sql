-- LV-INVENTORY-REORDER-TRIGGER-PHANTOM-COLUMN
-- The legacy reorder alert trigger referenced parts_inventory.reorder_point, a column that never
-- existed on the canonical table. Every update of on_hand_qty therefore raised 42703 and rolled
-- the complete part edit back. Bind the trigger to the canonical reorder_threshold column.

CREATE OR REPLACE FUNCTION maintenance.check_parts_reorder_alert()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.on_hand_qty IS NOT NULL
     AND NEW.reorder_threshold IS NOT NULL
     AND NEW.on_hand_qty <= NEW.reorder_threshold
     AND (
       OLD.on_hand_qty IS NULL
       OR OLD.reorder_threshold IS NULL
       OR OLD.on_hand_qty > OLD.reorder_threshold
     ) THEN
    RAISE NOTICE 'REORDER ALERT: part % (%) is at or below reorder threshold (qty=%, reorder=%)',
      NEW.id, NEW.part_description, NEW.on_hand_qty, NEW.reorder_threshold;

    IF to_regclass('public.audit_log') IS NOT NULL THEN
      INSERT INTO public.audit_log (
        table_name, record_id, action, changed_by, change_data
      ) VALUES (
        'maintenance.parts_inventory',
        NEW.id,
        'REORDER_ALERT',
        current_setting('app.current_user_id', true),
        jsonb_build_object(
          'part_description', NEW.part_description,
          'on_hand_qty', NEW.on_hand_qty,
          'reorder_threshold', NEW.reorder_threshold,
          'alert_type', 'below_reorder_threshold'
        )
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS parts_inventory_reorder_check ON maintenance.parts_inventory;
CREATE TRIGGER parts_inventory_reorder_check
  AFTER UPDATE OF on_hand_qty, reorder_threshold ON maintenance.parts_inventory
  FOR EACH ROW EXECUTE FUNCTION maintenance.check_parts_reorder_alert();
