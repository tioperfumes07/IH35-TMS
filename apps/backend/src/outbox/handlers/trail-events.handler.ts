import type { OutboxEventHandler, OutboxHandlerContext, OutboxHandlerResult, OutboxPayload } from "./registry.js";

class TrailEventHandler implements OutboxEventHandler {
  constructor(readonly eventType: string) {}

  canHandle() {
    return true;
  }

  async deliver(_payload: OutboxPayload, ctx: OutboxHandlerContext): Promise<OutboxHandlerResult> {
    ctx.log("outbox trail event acknowledged", { eventId: ctx.eventId, eventType: this.eventType });
    return { message: "trail_event_acknowledged" };
  }
}

export function buildTrailEventHandlers(): OutboxEventHandler[] {
  return [
    new TrailEventHandler("expense.created.attributed"),
    new TrailEventHandler("expense.created.unattributed"),
    new TrailEventHandler("expense.reattributed"),
    new TrailEventHandler("accounting.invoice.html_requested"),
    new TrailEventHandler("accounting.journal_entry_pushed_to_qbo"),
    new TrailEventHandler("auth.email.verification_started"),
    new TrailEventHandler("dispatch.dispatch_sheet.requested"),
    new TrailEventHandler("load.abandoned"),
    new TrailEventHandler("chargeback.created"),
    new TrailEventHandler("driver_finance.cash_advance_request.escalated_to_owner"),
    new TrailEventHandler("driver_finance.cash_advance_request.owner_approved"),
    new TrailEventHandler("driver_finance.cash_advance_request.owner_denied"),
    new TrailEventHandler("driver_finance.cash_advance_request.submitted"),
    new TrailEventHandler("driver_finance.cash_advance_request.cancelled_by_driver"),
    new TrailEventHandler("driver_finance.cash_advance_request.approved"),
    new TrailEventHandler("driver_finance.cash_advance_request.denied"),
    new TrailEventHandler("settlement_dispute.submitted"),
    new TrailEventHandler("settlement_dispute.decided"),
    new TrailEventHandler("driver_finance.settlement.html_requested"),
    new TrailEventHandler("driver_finance.settlement.opened"),
    new TrailEventHandler("driver_finance.settlement.payment_due"),
    new TrailEventHandler("driver_finance.settlement.closed"),
    new TrailEventHandler("qbo.sync.escalated"),
    new TrailEventHandler("qbo.sync.retry_scheduled"),
    new TrailEventHandler("qbo.sync.failed"),
    new TrailEventHandler("driver.scheduler.leave_requested"),
    new TrailEventHandler("driver.scheduler.leave_denied"),
    new TrailEventHandler("driver.scheduler.leave_approved"),
    new TrailEventHandler("driver.scheduler.temp_cover_assigned"),
    new TrailEventHandler("work_order.created"),
    new TrailEventHandler("work_order.updated"),
    new TrailEventHandler("work_order.approved"),
    new TrailEventHandler("work_order.started"),
    new TrailEventHandler("work_order.completed"),
    new TrailEventHandler("accounting.bill.auto_created_from_wo"),
    new TrailEventHandler("work_order.cancelled"),
    new TrailEventHandler("work_order.photo_added"),
  ];
}
