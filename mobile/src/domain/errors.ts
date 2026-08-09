export class MoneyRangeError extends Error {
  constructor() {
    super('A money total is outside the supported exact range.');
    this.name = 'MoneyRangeError';
  }
}

export class LedgerCapacityError extends Error {
  constructor() {
    super('This ledger is above the supported transaction capacity.');
    this.name = 'LedgerCapacityError';
  }
}

export class InvalidCursorError extends Error {
  constructor() {
    super('This transaction page is no longer available.');
    this.name = 'InvalidCursorError';
  }
}

export class ExportScaleUnavailableError extends Error {
  constructor() {
    super('This export is too large for the current app version.');
    this.name = 'ExportScaleUnavailableError';
  }
}

export class BackupScaleUnavailableError extends Error {
  constructor() {
    super('This backup is too large for the version 1 backup format.');
    this.name = 'BackupScaleUnavailableError';
  }
}

export class DataBoundaryError extends Error {
  constructor() {
    super('Finova could not safely read local finance data.');
    this.name = 'DataBoundaryError';
  }
}
