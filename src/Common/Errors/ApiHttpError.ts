import { serializeForLog } from '@wexample/js-helpers/Helper/Serialize';
import AbstractAppError from './AbstractAppError';

export type ApiHttpErrorOptions = {
  status: number;
  statusText: string;
  url: string;
  method?: string;
  code?: string;
  payload?: unknown;
  message?: string;
  cause?: unknown;
};

export default class ApiHttpError extends AbstractAppError {
  public readonly status: number;
  public readonly statusText: string;
  public readonly url: string;
  public readonly method: string;
  public readonly payload?: unknown;

  constructor(options: ApiHttpErrorOptions) {
    super({
      message: options.message || ApiHttpError.defaultMessage(options),
      kind: 'api.http',
      code: options.code,
      severity: options.status >= 500 ? 'error' : 'warning',
      context: {
        status: options.status,
        statusText: options.statusText,
        method: options.method || 'GET',
        url: options.url,
      },
      cause: options.cause,
    });
    this.status = options.status;
    this.statusText = options.statusText;
    this.url = options.url;
    this.method = options.method || 'GET';
    this.payload = options.payload;
  }

  static async fromResponse(
    response: Response,
    options: { method?: string; message?: string; cause?: unknown } = {}
  ): Promise<ApiHttpError> {
    let payload: unknown;
    let code: string | undefined;

    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      try {
        payload = await response.clone().json();
        if (payload && typeof payload === 'object' && 'code' in payload) {
          const apiCode = (payload as { code?: unknown }).code;
          if (typeof apiCode === 'string' && apiCode.trim() !== '') {
            code = apiCode;
          }
        }
      } catch {
        payload = undefined;
      }
    } else {
      try {
        const text = await response.clone().text();
        if (text.trim() !== '') {
          payload = text;
        }
      } catch {
        payload = undefined;
      }
    }

    return new ApiHttpError({
      status: response.status,
      statusText: response.statusText,
      url: response.url,
      method: options.method || 'GET',
      code,
      payload,
      message: options.message,
      cause: options.cause,
    });
  }

  private static defaultMessage(options: {
    status: number;
    statusText: string;
    method?: string;
    url: string;
  }): string {
    const method = options.method || 'GET';
    return `${method} ${options.url} failed with HTTP ${options.status} ${options.statusText}`;
  }

  override toLogPayload() {
    return {
      ...super.toLogPayload(),
      context: {
        ...this.context,
        status: this.status,
        statusText: this.statusText,
        method: this.method,
        url: this.url,
      },
      payload: serializeForLog(this.payload),
    };
  }
}
