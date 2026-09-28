import ky, { type KyInstance, type Options } from 'ky';
import ApiHttpError from './Errors/ApiHttpError';

export type ApiClientErrorContext = {
  method?: string;
  pathOrUrl?: string;
};

/**
 * Transport options mirror php-api's ClientOptions and the Python
 * wexample_api AbstractGateway; every duration is in seconds.
 */
export type ApiClientOptions = Readonly<{
  baseUrl?: string | null;
  bearerToken?: string | null;
  defaultHeaders?: Record<string, string>;
  onError?: (error: unknown, context?: ApiClientErrorContext) => void | Promise<void>;
  /** Seconds a whole request may take; `false` waits indefinitely. Defaults to ky's 10 seconds. */
  timeout?: number | false;
  /**
   * Extra attempts after a transient failure, for idempotent methods only:
   * a retried POST or PATCH could apply twice on the remote.
   */
  retries?: number;
  /** Seconds before the first retry, doubled at each further attempt. */
  retryDelay?: number;
  /** Minimum seconds between two requests of the same client. */
  rateLimitDelay?: number;
}>;

const IDEMPOTENT_METHODS = ['get', 'put', 'head', 'delete', 'options', 'trace'];

type NoExtra<T, U extends T> = U & Record<Exclude<keyof U, keyof T>, never>;
type ApiClientGetOptions = {
  path: string;
  options?: Options;
};
type ApiClientAbsoluteGetOptions = {
  url: string;
  options?: Options;
};
type ApiClientPostOptions = {
  path: string;
  options?: Options;
};
type ApiClientAbsolutePostOptions = {
  url: string;
  options?: Options;
};
type ApiClientDeleteOptions = {
  path: string;
  options?: Options;
};
type ApiClientAbsoluteDeleteOptions = {
  url: string;
  options?: Options;
};
type ApiClientPostFormDataOptions = {
  path: string;
  formData: FormData;
  options?: Options;
};
type ApiClientFormDataFromJsonOptions = {
  path: string;
  data: unknown;
  files?: File[];
  fileKeyPrefix?: string;
  options?: Options;
};
type SetDefaultHeaderOptions = {
  name: string;
  value: string;
};

type ApiRequestErrorHandlingContext = {
  captureError?: boolean;
  onError?: (options: {
    error: unknown;
    context?: ApiClientErrorContext;
    requestError?: ApiClientBeforeErrorInput;
  }) => boolean | Promise<boolean>;
};

type ApiClientBeforeErrorInput = {
  name?: string;
  response?: Response;
  request?: Request;
  options?: {
    context?: ApiRequestErrorHandlingContext;
  };
};

export default abstract class AbstractApiClient {
  /** Path requested by checkConnection(), relative to the base URL. */
  static pingPath = '';

  public readonly baseUrl: string | null;
  protected readonly client: KyInstance;
  protected readonly absoluteClient: KyInstance;
  protected bearerToken: string | null;
  protected defaultHeaders: Record<string, string>;
  protected onError?: (error: unknown, context?: ApiClientErrorContext) => void | Promise<void>;
  protected readonly rateLimitDelay: number;
  private nextRequestAt = 0;

  protected constructor(options: ApiClientOptions = {}) {
    this.baseUrl = options.baseUrl ?? null;
    this.bearerToken = options.bearerToken ?? null;
    this.defaultHeaders = { ...(options.defaultHeaders ?? {}) };
    this.onError = options.onError;
    this.rateLimitDelay = options.rateLimitDelay ?? 0;

    const hooks = {
      beforeRequest: [
        async (request: Request) => {
          await this.waitForRateLimit();

          const headers = request.headers;

          for (const [name, value] of Object.entries(this.defaultHeaders)) {
            headers.set(name, value);
          }

          if (this.bearerToken) {
            headers.set('Authorization', `Bearer ${this.bearerToken}`);
          }
        },
      ],
      beforeError: [
        (async (error: unknown) => {
          const httpError = error as ApiClientBeforeErrorInput;
          let mappedError: unknown = error;

          if (httpError?.name === 'HTTPError' && httpError.response) {
            mappedError = await ApiHttpError.fromResponse(httpError.response, {
              method: httpError.request?.method || 'GET',
              cause: error,
            });
          }

          if (!(await this.shouldCaptureError(httpError, mappedError))) {
            return mappedError as any;
          }

          await this.onError?.(mappedError, {
            method: httpError.request?.method,
            pathOrUrl: httpError.request?.url,
          });

          if (httpError?.name !== 'HTTPError' || !httpError.response) {
            return error as any;
          }

          return mappedError as any;
        }) as any,
      ],
    };

    const retryDelay = options.retryDelay ?? 1;
    const clientOptions: Options = {
      hooks,
      retry: {
        limit: options.retries ?? 0,
        methods: IDEMPOTENT_METHODS,
        delay: (attemptCount: number) => retryDelay * 1000 * 2 ** (attemptCount - 1),
        // beforeError has already turned ky's HTTPError into an ApiHttpError,
        // which ky's own status check no longer recognizes. Undefined keeps
        // ky's defaults: network failures retried, timeouts not.
        shouldRetry: ({ error }: { error: unknown }) =>
          error instanceof ApiHttpError ? error.isTransient() : undefined,
      },
    };

    if (options.timeout !== undefined) {
      clientOptions.timeout = options.timeout === false ? false : options.timeout * 1000;
    }

    this.client = this.baseUrl
      ? ky.create({ ...clientOptions, prefixUrl: this.baseUrl.replace(/\/+$/, '') })
      : ky.create(clientOptions);
    this.absoluteClient = ky.create(clientOptions);
  }

  protected async shouldCaptureError(
    error: ApiClientBeforeErrorInput,
    mappedError: unknown
  ): Promise<boolean> {
    const requestContext = error.options?.context;

    if (typeof requestContext?.onError === 'function') {
      const shouldCapture = await requestContext.onError({
        error: mappedError,
        context: {
          method: error.request?.method,
          pathOrUrl: error.request?.url,
        },
        requestError: error,
      });

      return shouldCapture !== false;
    }

    return requestContext?.captureError !== false;
  }

  static create<T extends AbstractApiClient, U extends ApiClientOptions>(
    this: new (
      options?: ApiClientOptions
    ) => T,
    options: NoExtra<ApiClientOptions, U> = {} as NoExtra<ApiClientOptions, U>
  ): T {
    // biome-ignore lint: keep subclass instantiation with `this`.
    return new this(options);
  }

  /**
   * Whether the remote answers pingPath without an error status. A failure
   * of any kind is the answer, not an error: callers use it for health checks.
   */
  async checkConnection(): Promise<boolean> {
    const pingPath = (this.constructor as typeof AbstractApiClient).pingPath;

    try {
      await this.get({ path: pingPath, options: { context: { captureError: false } } });
    } catch {
      return false;
    }

    return true;
  }

  /**
   * Delays the request so two requests are at least rateLimitDelay apart,
   * including concurrent ones which are queued one slot after the other.
   */
  protected async waitForRateLimit(): Promise<void> {
    if (this.rateLimitDelay <= 0) {
      return;
    }

    const now = Date.now();
    const sendAt = Math.max(now, this.nextRequestAt);
    this.nextRequestAt = sendAt + this.rateLimitDelay * 1000;

    if (sendAt > now) {
      await new Promise((resolve) => setTimeout(resolve, sendAt - now));
    }
  }

  get({ path, options }: ApiClientGetOptions) {
    return this.client.get(this.normalizePath(path), options);
  }

  getAbsolute({ url, options }: ApiClientAbsoluteGetOptions) {
    return this.absoluteClient.get(url, options);
  }

  post({ path, options }: ApiClientPostOptions) {
    return this.client.post(this.normalizePath(path), options);
  }

  postAbsolute({ url, options }: ApiClientAbsolutePostOptions) {
    return this.absoluteClient.post(url, options);
  }

  delete({ path, options }: ApiClientDeleteOptions) {
    return this.client.delete(this.normalizePath(path), options);
  }

  deleteAbsolute({ url, options }: ApiClientAbsoluteDeleteOptions) {
    return this.absoluteClient.delete(url, options);
  }

  postFormData({ path, formData, options }: ApiClientPostFormDataOptions) {
    return this.client.post(this.normalizePath(path), {
      ...options,
      body: formData,
    });
  }

  requestFormDataFromJson({
    path,
    data,
    files,
    fileKeyPrefix = 'upload_',
    options,
  }: ApiClientFormDataFromJsonOptions) {
    const formData = this.createFormDataWithJson(data, files, fileKeyPrefix);
    return this.postFormData({ path, formData, options });
  }

  createFormDataWithJson(
    data: unknown,
    files?: File[],
    fileKeyPrefix: string = 'upload_'
  ): FormData {
    const formData = new FormData();

    formData.append('data', JSON.stringify(data ?? {}));

    if (files?.length) {
      files.forEach((file, index) => {
        formData.append(`${fileKeyPrefix}${index}`, file);
      });
    }

    return formData;
  }

  setBearerToken(token: string | null): void {
    this.bearerToken = token;
  }

  setApiToken(token: string | null): void {
    this.setBearerToken(token);
  }

  getDefaultHeaders(): Record<string, string> {
    return { ...this.defaultHeaders };
  }

  setDefaultHeaders(headers: Record<string, string>): void {
    this.defaultHeaders = { ...headers };
  }

  setDefaultHeader(options: SetDefaultHeaderOptions): void {
    this.defaultHeaders[options.name] = options.value;
  }

  removeDefaultHeader(name: string): void {
    delete this.defaultHeaders[name];
  }

  protected normalizePath(path: string): string {
    if (!this.baseUrl) {
      return path;
    }

    return path.replace(/^\/+/, '');
  }
}
