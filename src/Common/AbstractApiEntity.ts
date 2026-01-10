export default abstract class AbstractApiEntity {
  static readonly entityName: string;
  id?: number | string;
  secureId?: string;

  protected constructor(data: Record<string, any> = {}) {
    this.id = data['id'];
    this.secureId = data['secureId'];
  }

  static fromApi<T extends typeof AbstractApiEntity>(
    this: T,
    data: Record<string, any>
  ): InstanceType<T> {
    return new this(data) as InstanceType<T>;
  }

  static fromApiCollection<T extends typeof AbstractApiEntity>(
    this: T,
    collection: Record<string, any>[]
  ): InstanceType<T>[] {
    return collection.map((item) => this.fromApi(item));
  }
}
