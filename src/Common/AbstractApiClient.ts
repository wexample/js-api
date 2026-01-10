import ky, { type KyInstance, type Options } from 'ky';

export type ApiClientOptions = Readonly<{ baseUrl?: string | null }>;

type NoExtra<T, U extends T> = U & Record<Exclude<keyof U, keyof T>, never>;

export default abstract class AbstractApiClient {
  public readonly baseUrl: string | null;
  protected readonly client: KyInstance;

  protected constructor(options: ApiClientOptions = {}) {
    this.baseUrl = options.baseUrl ?? null;
    this.client = this.baseUrl
      ? ky.create({ prefixUrl: this.baseUrl.replace(/\/+$/, '') })
      : ky;
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

  protected normalizePath(path: string): string {
    if (!this.baseUrl) {
      return path;
    }

    return path.replace(/^\/+/, '');
  }
}
