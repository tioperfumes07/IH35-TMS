/**
 * The Settlement Creator's refusal error, in its own leaf module. The helper modules (admission, line-load,
 * pay-item, deliver) throw it and settlement-creator.service.ts imports those helpers; defining it in the service
 * made a 6-file import cycle (verify-no-circular-dependencies). The service re-exports it, so importers are unchanged.
 */
export class SettlementCreatorError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "SettlementCreatorError";
    this.code = code;
  }
}
