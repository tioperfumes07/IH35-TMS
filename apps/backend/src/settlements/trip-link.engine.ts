/**
 * Trip-Link Engine (D1)
 * 
 * Automatically links expenses to trips (loads) based on truck + date matching.
 * When a truck was dispatched on a load whose date window contains the expense date,
 * the expense auto-links to that trip.
 */

type Queryable = {
  query: <R = unknown>(sql: string, values?: unknown[]) => Promise<{ rows: R[] }>;
};

export interface TripLinkMatch {
  loadId: string;
  loadNumber: string;
  truckId: string;
  truckNumber: string;
  dispatchDate: string;
  deliveryDate: string;
  expenseDate: string;
  matchReason: string;
  confidence: 'high' | 'medium' | 'low' | 'multiple';
}

export interface TripLinkSuggestion {
  expenseId: string;
  expenseTable: string;
  unitId: string;
  expenseDate: string;
  matches: TripLinkMatch[];
  bestMatch?: TripLinkMatch;
}

/**
 * Find loads where the truck was dispatched and the expense date falls within the load window.
 */
export async function findTripMatches(
  client: Queryable,
  unitId: string,
  expenseDate: string
): Promise<TripLinkMatch[]> {
  // Find loads where this truck was assigned and the expense date falls in the dispatch window
  const result = await client.query<{ 
    load_id: string; 
    load_number: string;
    truck_id: string;
    truck_number: string;
    dispatch_date: string;
    delivery_date: string;
  }>(`
    SELECT 
      l.id as load_id,
      l.load_number,
      u.id as truck_id,
      u.unit_number as truck_number,
      l.pickup_appointment_start::date as dispatch_date,
      COALESCE(l.delivery_appointment_end, l.delivery_appointment_start)::date as delivery_date
    FROM dispatch.loads l
    JOIN dispatch.load_assignments la ON la.load_id = l.id
    JOIN mdata.units u ON u.id = la.unit_id
    WHERE la.unit_id = $1
      AND l.pickup_appointment_start::date <= $2::date
      AND COALESCE(l.delivery_appointment_end, l.delivery_appointment_start)::date >= $2::date
      AND l.status NOT IN ('cancelled', 'draft')
    ORDER BY l.pickup_appointment_start DESC
  `, [unitId, expenseDate]);

  return result.rows.map((row: {
    load_id: string;
    load_number: string;
    truck_id: string;
    truck_number: string;
    dispatch_date: string;
    delivery_date: string;
  }) => {
    const expenseDt = new Date(expenseDate);
    const dispatchDt = new Date(row.dispatch_date);
    const deliveryDt = new Date(row.delivery_date);
    
    // Calculate confidence based on match quality
    let confidence: TripLinkMatch['confidence'] = 'medium';
    const reasonParts: string[] = [];
    
    // Check if exactly one day match or multiple days
    const daysInWindow = Math.ceil((deliveryDt.getTime() - dispatchDt.getTime()) / (1000 * 60 * 60 * 24)) + 1;
    
    if (daysInWindow === 1) {
      confidence = 'high';
      reasonParts.push(`Truck ${row.truck_number} dispatched on load ${row.load_number} on exact date ${expenseDate}`);
    } else {
      reasonParts.push(`Truck ${row.truck_number} dispatched on load ${row.load_number}`);
      reasonParts.push(`date ${expenseDate} falls within dispatch window (${row.dispatch_date} → ${row.delivery_date})`);
    }
    
    return {
      loadId: row.load_id,
      loadNumber: row.load_number,
      truckId: row.truck_id,
      truckNumber: row.truck_number,
      dispatchDate: row.dispatch_date,
      deliveryDate: row.delivery_date,
      expenseDate: expenseDate,
      matchReason: reasonParts.join('; '),
      confidence
    };
  });
}

/**
 * Suggest trip links for an expense based on truck + date.
 * Returns multiple matches if the window overlaps multiple loads,
 * allowing the admin to pick.
 */
export async function suggestTripLink(
  client: Queryable,
  expenseId: string,
  expenseTable: string,
  unitId: string,
  expenseDate: string
): Promise<TripLinkSuggestion> {
  const matches = await findTripMatches(client, unitId, expenseDate);
  
  // Determine best match and overall confidence
  let bestMatch: TripLinkMatch | undefined;
  let overallConfidence: TripLinkMatch['confidence'] = 'low';
  
  if (matches.length === 1) {
    bestMatch = matches[0];
    overallConfidence = matches[0].confidence;
  } else if (matches.length > 1) {
    // Multiple matches - require manual selection
    overallConfidence = 'multiple';
    // Pick the first high confidence one as tentative best, but flag as multiple
    bestMatch = matches.find(m => m.confidence === 'high') || matches[0];
  }
  
  return {
    expenseId,
    expenseTable,
    unitId,
    expenseDate,
    matches,
    bestMatch
  };
}

/**
 * Auto-link an expense to a trip when there's exactly one high-confidence match.
 * Returns the linked load ID or null if no unique match.
 */
export async function autoLinkExpense(
  client: Queryable,
  expenseId: string,
  expenseTable: string,
  unitId: string,
  expenseDate: string
): Promise<{ loadId: string | null; loadNumber: string | null; reason: string; autoLinked: boolean }> {
  const suggestion = await suggestTripLink(client, expenseId, expenseTable, unitId, expenseDate);
  
  if (suggestion.matches.length === 0) {
    return {
      loadId: null,
      loadNumber: null,
      reason: `No loads found for truck on ${expenseDate}`,
      autoLinked: false
    };
  }
  
  if (suggestion.matches.length === 1 && suggestion.bestMatch?.confidence === 'high') {
    // Unique high-confidence match - auto-link
    return {
      loadId: suggestion.bestMatch.loadId,
      loadNumber: suggestion.bestMatch.loadNumber,
      reason: suggestion.bestMatch.matchReason,
      autoLinked: true
    };
  }
  
  // Multiple matches or low confidence - surface for manual selection
  return {
    loadId: null,
    loadNumber: null,
    reason: suggestion.matches.length > 1 
      ? `Multiple possible loads (${suggestion.matches.length}) on ${expenseDate} - manual selection required`
      : `Low confidence match - manual verification required`,
    autoLinked: false
  };
}

/**
 * Queue an expense for manual trip link assignment.
 */
export async function queueForTripLink(
  client: Queryable,
  operatingCompanyId: string,
  expenseId: string,
  expenseTable: string,
  expenseType: string,
  unitId: string,
  expenseDate: string
): Promise<string> {
  // Get suggestion for display
  const suggestion = await suggestTripLink(client, expenseId, expenseTable, unitId, expenseDate);
  
  const result = await client.query<{ id: string }>(`
    INSERT INTO driver_finance.trip_link_queue (
      operating_company_id,
      expense_id,
      expense_table,
      expense_type,
      unit_id,
      expense_date,
      suggested_load_id,
      suggested_load_number,
      suggested_reason,
      status
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    ON CONFLICT (expense_id, expense_table) DO UPDATE SET
      suggested_load_id = EXCLUDED.suggested_load_id,
      suggested_load_number = EXCLUDED.suggested_load_number,
      suggested_reason = EXCLUDED.suggested_reason,
      status = CASE 
        WHEN driver_finance.trip_link_queue.status = 'linked' THEN 'linked'
        WHEN EXCLUDED.suggested_load_id IS NOT NULL THEN 'suggested'
        ELSE 'pending'
      END,
      updated_at = now()
    RETURNING id
  `, [
    operatingCompanyId,
    expenseId,
    expenseTable,
    expenseType,
    unitId,
    expenseDate,
    suggestion.bestMatch?.loadId || null,
    suggestion.bestMatch?.loadNumber || null,
    suggestion.bestMatch?.matchReason || suggestion.matches.map(m => m.matchReason).join('; ') || 'No matching loads found',
    suggestion.bestMatch ? 'suggested' : 'pending'
  ]);
  
  return result.rows[0].id;
}

/**
 * Assign a load to a queued expense (manual override).
 */
export async function assignTripLink(
  client: Queryable,
  queueId: string,
  loadId: string,
  loadNumber: string,
  assignedBy: string
): Promise<void> {
  await client.query(`
    UPDATE driver_finance.trip_link_queue
    SET 
      assigned_load_id = $1,
      assigned_at = now(),
      assigned_by = $2,
      status = 'assigned'
    WHERE id = $3
  `, [loadId, assignedBy, queueId]);
}
