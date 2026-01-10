import type AbstractApiEntitiesClient from './AbstractApiEntitiesClient';
import AbstractApiEntity from './AbstractApiEntity';

export default abstract class AbstractApiRepository {
  protected readonly client: AbstractApiEntitiesClient;

  protected constructor(client: AbstractApiEntitiesClient) {
    this.client = client;
  }

  static getEntityType(): typeof AbstractApiEntity {
    throw new Error('Repository must define getEntityType().');
  }

  static getEntityName(): string {
    const entityType = this.getEntityType();
    const entityName = entityType.entityName;

    if (!entityName) {
      throw new Error('Entity type must define a static entityName.');
    }

    return entityName;
  }

  protected createFromApiItem<T extends AbstractApiEntity>(
    data: Record<string, any>
  ): T {
    const entityType = (this.constructor as typeof AbstractApiRepository).getEntityType();
    return entityType.fromApi(data) as T;
  }

  protected createFromApiCollection<T extends AbstractApiEntity>(
    collection: Record<string, any>[]
  ): T[] {
    return collection.map((item) => this.createFromApiItem<T>(item));
  }

  protected buildPath(pathSuffix: string): string {
    const entityName = (this.constructor as typeof AbstractApiRepository).getEntityName();
    return `${entityName}/${pathSuffix}`;
  }
}
