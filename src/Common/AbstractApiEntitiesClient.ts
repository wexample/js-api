import AbstractApiClient, { type ApiClientOptions } from './AbstractApiClient';
import AbstractApiEntity from './AbstractApiEntity';
import type AbstractApiRepository from './AbstractApiRepository';
import ApiEntityManager from './ApiEntityManager';

export default abstract class AbstractApiEntitiesClient extends AbstractApiClient {
  private readonly entityManager: ApiEntityManager;

  protected constructor(options: ApiClientOptions = {}) {
    super(options);
    this.entityManager = new ApiEntityManager(this, this.getRepositoryClasses());
  }

  protected abstract getRepositoryClasses(): Array<typeof AbstractApiRepository>;

  getEntityManager(): ApiEntityManager {
    return this.entityManager;
  }

  getRepository<T extends AbstractApiRepository>(
    entity: string | typeof AbstractApiEntity
  ): T {
    return this.entityManager.get(entity);
  }
}
