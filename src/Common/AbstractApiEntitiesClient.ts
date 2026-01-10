import AbstractApiClient, { type ApiClientOptions } from './AbstractApiClient';
import AbstractApiEntity, { type ApiEntityConstructor } from './AbstractApiEntity';
import type AbstractApiRepository from './AbstractApiRepository';
import ApiEntityManager, { type RepositoryClass } from './ApiEntityManager';

export default abstract class AbstractApiEntitiesClient extends AbstractApiClient {
  private readonly entityManager: ApiEntityManager;

  protected constructor(options: ApiClientOptions = {}) {
    super(options);
    this.entityManager = new ApiEntityManager(this, this.getRepositoryClasses());
  }

  protected abstract getRepositoryClasses(): RepositoryClass[];

  getEntityManager(): ApiEntityManager {
    return this.entityManager;
  }

  getRepository<T extends AbstractApiRepository>(
    entity: string | ApiEntityConstructor<AbstractApiEntity>
  ): T {
    return this.entityManager.get(entity);
  }
}
