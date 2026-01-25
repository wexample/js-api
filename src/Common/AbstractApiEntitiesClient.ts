import AbstractApiClient, { type ApiClientOptions } from './AbstractApiClient.js';
import type AbstractApiEntity from './AbstractApiEntity.js';
import type { ApiEntityConstructor } from './AbstractApiEntity.js';
import type AbstractApiRepository from './AbstractApiRepository.js';
import ApiEntityManager, { type RepositoryClass } from './ApiEntityManager.js';

export default abstract class AbstractApiEntitiesClient extends AbstractApiClient {
  private readonly entityManager: ApiEntityManager;

  protected constructor(options: ApiClientOptions = {}) {
    super(options);
    this.entityManager = new ApiEntityManager({
      client: this,
      repositories: this.getRepositoryClasses(),
    });
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
