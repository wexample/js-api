import type AbstractApiEntitiesClient from './AbstractApiEntitiesClient';
import AbstractApiEntity, {
  type ApiEntityConstructor,
  type ApiEntityData,
} from './AbstractApiEntity';

type RepositoryClass<T extends AbstractApiEntity> = {
  getEntityType(): ApiEntityConstructor<T>;
};

export default abstract class AbstractApiRepository<T extends AbstractApiEntity = AbstractApiEntity> {
  protected readonly client: AbstractApiEntitiesClient;

  constructor(client: AbstractApiEntitiesClient) {
    this.client = client;
  }

  static getEntityType(): ApiEntityConstructor<AbstractApiEntity> {
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

  protected getEntityType(): ApiEntityConstructor<T> {
    const repositoryClass = this.constructor as unknown as RepositoryClass<T>;

    if (typeof repositoryClass.getEntityType !== 'function') {
      throw new Error('Repository must implement a static getEntityType().');
    }

    return repositoryClass.getEntityType();
  }

  protected createFromApiItem(data: ApiEntityData): T {
    const entityType = this.getEntityType();
    return entityType.fromApi(data);
  }

  protected createFromApiCollection(collection: ApiEntityData[]): T[] {
    return collection.map((item) => this.createFromApiItem(item));
  }

  protected buildPath(pathSuffix: string): string {
    const entityName = (this.constructor as typeof AbstractApiRepository).getEntityName();
    return `${entityName}/${pathSuffix}`;
  }
}
