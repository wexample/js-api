import type AbstractApiEntitiesClient from "./AbstractApiEntitiesClient";
import type AbstractApiEntity from "./AbstractApiEntity";
import type { ApiEntityConstructor } from "./AbstractApiEntity";
import type AbstractApiRepository from "./AbstractApiRepository";
import type ApiEntityManager from "./ApiEntityManager";

export type EntityClass<T extends AbstractApiEntity = AbstractApiEntity> =
  ApiEntityConstructor<T>;

export interface EntityManipulator<T extends AbstractApiEntity = AbstractApiEntity> {
  getEntityClass(): ApiEntityConstructor<T>;
  getEntityManager(): ApiEntityManager;
  getEntityRepository(entityType?: ApiEntityConstructor<T>): AbstractApiRepository<T>;
}

export default abstract class AbstractEntityManipulator<
  T extends AbstractApiEntity = AbstractApiEntity,
> implements EntityManipulator<T> {
  protected readonly apiClient: AbstractApiEntitiesClient;

  protected constructor(apiClient: AbstractApiEntitiesClient) {
    this.apiClient = apiClient;
  }

  abstract getEntityClass(): EntityClass<T>;

  getEntityManager(): ApiEntityManager {
    return this.apiClient.getEntityManager();
  }

  getEntityRepository(
    entityType?: EntityClass<T>,
  ): AbstractApiRepository<T> {
    const entityClass = entityType ?? this.getEntityClass();
    return this.apiClient.getRepository(entityClass) as AbstractApiRepository<T>;
  }
}

export function createEntityManipulator<T extends AbstractApiEntity>(
  apiClient: AbstractApiEntitiesClient,
  getEntityClass: () => ApiEntityConstructor<T>,
): EntityManipulator<T> {
  class InlineEntityManipulator extends AbstractEntityManipulator<T> {
    getEntityClass(): ApiEntityConstructor<T> {
      return getEntityClass();
    }
  }

  return new InlineEntityManipulator(apiClient);
}
