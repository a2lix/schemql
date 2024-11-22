export enum AdapterErrorCode {
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

export class BaseAdapterError extends Error {
  public constructor(
    message: string,
    public code: AdapterErrorCode,
    public originalError?: Error
  ) {
    super(message)
    this.name = 'AdapterError'
  }

  public isNoResultError = () => this.code === AdapterErrorCode.NoResult
}
