export class PlatformStoreConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PlatformStoreConflictError';
  }
}

export class PlatformStoreUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PlatformStoreUnavailableError';
  }
}
