import type AbstractApiEntitiesClient from './AbstractApiEntitiesClient';
import AbstractApiEntity, { type ApiEntityConstructor } from './AbstractApiEntity';
import AbstractApiRepository from './AbstractApiRepository';

export type RepositoryClass<T extends AbstractApiEntity = AbstractApiEntity> = {
  new (client: AbstractApiEntitiesClient): AbstractApiRepository<T>;
  getEntityType(): ApiEntityConstructor<T>;
};

type RegistryEntry<T extends AbstractApiEntity = AbstractApiEntity> = {
  entity: ApiEntityConstructor<T>;
  repository: RepositoryClass<T>;
  instance: AbstractApiRepository<T> | null;
};

export default class ApiEntityManager {
  private readonly client: AbstractApiEntitiesClient;
  private registry: Record<string, RegistryEntry> = {};

  constructor(client: AbstractApiEntitiesClient, repositories: RepositoryClass[]) {
    this.client = client;
    this.buildRegistry(repositories);
  }

  get<T extends AbstractApiRepository>(
    entity: string | ApiEntityConstructor<AbstractApiEntity>
  ): T {
    const entityName =
      typeof entity === 'string' ? entity : entity.entityName;

    const registryEntry = this.registry[entityName];

    if (!registryEntry) {
      throw new Error(
        `Entity ${entityName} is not registered. Available repositories: ${Object.keys(this.registry).join(', ')}`
      );
    }

    if (!registryEntry.instance) {
      const RepositoryClass = registryEntry.repository;
      registryEntry.instance = new RepositoryClass(this.client);
    }

    return registryEntry.instance as T;
  }

  all(): Record<string, AbstractApiRepository> {
    const instances: Record<string, AbstractApiRepository> = {};

    for (const [entityName] of Object.entries(this.registry)) {
      instances[entityName] = this.get(entityName);
    }

    return instances;
  }

  private buildRegistry(repositories: RepositoryClass[]): void {
    this.registry = {};

    for (const repositoryClass of repositories) {
      const entityType = repositoryClass.getEntityType();
      const entityName = entityType.entityName;

      if (!entityName) {
        throw new Error('Entity type must define a static entityName.');
      }

      this.registry[entityName] = {
        repository: repositoryClass,
        entity: entityType,
        instance: null,
      };
    }
  }
}
