import ky, { type KyInstance, type Options } from 'ky';

export type ApiClientOptions = Readonly<{
  baseUrl?: string | null;
  bearerToken?: string | null;
  defaultHeaders?: Record<string, string>;
}>;

type NoExtra<T, U extends T> = U & Record<Exclude<keyof U, keyof T>, never>;
type ApiClientGetOptions = {
  path: string;
  options?: Options;
};
type ApiClientPostOptions = {
  path: string;
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
    this: new (
      options?: ApiClientOptions
    ) => T,
    options: NoExtra<ApiClientOptions, U> = {} as NoExtra<ApiClientOptions, U>
  ): T {
    return new AbstractApiClient(options);
  }

  get({ path, options }: ApiClientGetOptions) {
    return this.client.get(this.normalizePath(path), options);
  }

  post({ path, options }: ApiClientPostOptions) {
    return this.client.post(this.normalizePath(path), options);
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
