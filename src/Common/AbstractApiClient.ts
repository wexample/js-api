import ky, { type KyInstance, type Options } from 'ky';

export type ApiClientOptions = Readonly<{
  baseUrl?: string | null;
  bearerToken?: string | null;
  defaultHeaders?: Record<string, string>;
}>;

type NoExtra<T, U extends T> = U & Record<Exclude<keyof U, keyof T>, never>;

export default abstract class AbstractApiClient {
  public readonly baseUrl: string | null;
  protected readonly client: KyInstance;
  protected bearerToken: string | null;
  protected defaultHeaders: Record<string, string>;

  protected constructor(options: ApiClientOptions = {}) {
    this.baseUrl = options.baseUrl ?? null;
    this.bearerToken = options.bearerToken ?? null;
    this.defaultHeaders = { ...(options.defaultHeaders ?? {}) };

    const hooks = {
      beforeRequest: [
        (request: Request) => {
          const headers = request.headers;

          for (const [name, value] of Object.entries(this.defaultHeaders)) {
            headers.set(name, value);
          }

          if (this.bearerToken) {
            headers.set('Authorization', `Bearer ${this.bearerToken}`);
          }
        },
      ],
    };

    this.client = this.baseUrl
      ? ky.create({ prefixUrl: this.baseUrl.replace(/\/+$/, ''), hooks })
      : ky.create({ hooks });
  }

  static create<T extends AbstractApiClient, U extends ApiClientOptions>(
    this: new (options?: ApiClientOptions) => T,
    options: NoExtra<ApiClientOptions, U> = {} as NoExtra<ApiClientOptions, U>
  ): T {
    return new this(options);
  }

  get(path: string, options?: Options) {
    return this.client.get(this.normalizePath(path), options);
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

  setDefaultHeader(name: string, value: string): void {
    this.defaultHeaders[name] = value;
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
