import type AbstractApiEntitiesClient from "./AbstractApiEntitiesClient";
import type AbstractApiEntity from "./AbstractApiEntity";
import type { ApiEntityConstructor } from "./AbstractApiEntity";
import type AbstractApiRepository from "./AbstractApiRepository";
import type ApiEntityManager from "./ApiEntityManager";

export type EntityClass<T extends AbstractApiEntity = AbstractApiEntity> =
  ApiEntityConstructor<T>;

export default abstract class AbstractEntityManipulator<
  T extends AbstractApiEntity = AbstractApiEntity,
> {
  protected readonly apiClient: AbstractApiEntitiesClient;

  protected constructor(apiClient: AbstractApiEntitiesClient) {
    this.apiClient = apiClient;
  }

  protected abstract getEntityClass(): EntityClass<T>;

  protected getEntityManager(): ApiEntityManager {
    return this.apiClient.getEntityManager();
  }

  protected getEntityRepository(
    entityType?: EntityClass<T>,
  ): AbstractApiRepository<T> {
    const entityClass = entityType ?? this.getEntityClass();
    return this.apiClient.getRepository(entityClass) as AbstractApiRepository<T>;
  }
}
