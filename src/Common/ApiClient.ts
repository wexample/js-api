import ky, { type KyInstance, type Options } from 'ky';

export type ApiClientOptions = Readonly<{ baseUrl?: string | null }>;

type NoExtra<T, U extends T> = U & Record<Exclude<keyof U, keyof T>, never>;

export default class ApiClient {
  public readonly baseUrl: string | null;
  protected readonly client: KyInstance;

  protected constructor(options: ApiClientOptions = {}) {
    this.baseUrl = options.baseUrl ?? null;
    this.client = this.baseUrl
      ? ky.create({ prefixUrl: this.baseUrl.replace(/\/+$/, '') })
      : ky;
  }

  static create<U extends ApiClientOptions>(options: NoExtra<ApiClientOptions, U> = {} as any) {
    return new ApiClient(options);
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
