export type ApiClientOptions = Readonly<{ baseUrl?: string | null }>;

type NoExtra<T, U extends T> = U & Record<Exclude<keyof U, keyof T>, never>;

export default class ApiClient {
  public readonly baseUrl: string | null;

  private constructor(options: ApiClientOptions = {}) {
    this.baseUrl = options.baseUrl ?? null;
  }

  static create<U extends ApiClientOptions>(options: NoExtra<ApiClientOptions, U> = {} as any) {
    return new ApiClient(options);
  }
}
