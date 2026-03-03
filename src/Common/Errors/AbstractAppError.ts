export type AppErrorSeverity = 'info' | 'warning' | 'error' | 'fatal';

export type AbstractAppErrorOptions = {
  message: string;
  kind: string;
  code?: string;
  severity?: AppErrorSeverity;
  context?: Record<string, unknown>;
  cause?: unknown;
};

export default abstract class AbstractAppError extends Error {
  public readonly kind: string;
  public readonly code?: string;
  public readonly severity: AppErrorSeverity;
  public readonly context: Record<string, unknown>;

  protected constructor(options: AbstractAppErrorOptions) {
    super(options.message);
    this.name = new.target.name;
    if (typeof options.cause !== 'undefined') {
      (this as Error & { cause?: unknown }).cause = options.cause;
    }
    this.kind = options.kind;
    this.code = options.code;
    this.severity = options.severity || 'error';
    this.context = { ...(options.context || {}) };
  }
}
