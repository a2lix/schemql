export enum DbAdapterErrorCode {
  InvalidParams = 'INVALID_PARAMS',
  InvalidResults = 'INVALID_RESULTS',
  UniqueConstraint = 'UNIQUE_CONSTRAINT',
  ForeignkeyConstraint = 'FOREIGNKEY_CONSTRAINT',
  NotnullConstraint = 'NOTNULL_CONSTRAINT',
  CheckConstraint = 'CHECK_CONSTRAINT',
  PrimarykeyConstraint = 'PRIMARYKEY_CONSTRAINT',
  NoResult = 'NO_RESULT',
  Generic = 'GENERIC',
}

export class BaseDbAdapterError extends Error {
  public constructor(
    message: string,
    public code: DbAdapterErrorCode,
    public originalError?: Error
  ) {
    super(message)
    this.name = 'DbAdapterError'
  }

  public isNoResultError = () => this.code === DbAdapterErrorCode.NoResult
}
