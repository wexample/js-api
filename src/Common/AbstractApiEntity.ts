export type ApiEntityData = Record<string, unknown>;

export type ApiEntityConstructor<T extends AbstractApiEntity> = {
  new (data?: ApiEntityData): T;
  readonly entityName: string;
  fromApi(data: ApiEntityData): T;
  fromApiCollection(collection: ApiEntityData[]): T[];
};

export default abstract class AbstractApiEntity {
  static readonly entityName: string;
  id?: number | string;
  secureId?: string;

  protected constructor(data: ApiEntityData = {}) {
    this.id = data['id'] as number | string | undefined;
    this.secureId = data['secureId'] as string | undefined;
  }

  static fromApi<T extends AbstractApiEntity>(
    this: ApiEntityConstructor<T>,
    data: ApiEntityData
  ): T {
    return new this(data);
  }

  static fromApiCollection<T extends AbstractApiEntity>(
    this: ApiEntityConstructor<T>,
    collection: ApiEntityData[]
  ): T[] {
    return collection.map((item) => this.fromApi(item));
  }
}
