import type AbstractApiEntitiesClient from './AbstractApiEntitiesClient.js';
import AbstractApiEntity, {
  type ApiEntityConstructor,
  type ApiEntityData,
  type ApiEntitySchema,
} from './AbstractApiEntity.js';
import ApiEntityStub from './ApiEntityStub.js';
import type ApiEntityRegistry from './ApiEntityRegistry.js';
import { stringToKebabCase } from '@wexample/js-helpers/Helper/String';
import {
  extractItems as extractItemsFromPayload,
  extractPayload as extractPayloadData,
} from '../Helper/ApiPayloadHelper.js';

type RepositoryClass<T extends AbstractApiEntity> = {
  getEntityType(): ApiEntityConstructor<T>;
};

type ApiItemMetadata = Record<string, unknown> | unknown[];
type ApiItemRelationships = Record<string, unknown> | unknown[];
type ApiItem = ApiEntityData & {
  entity?: ApiEntityData;
  metadata?: ApiItemMetadata;
  relationships?: ApiItemRelationships;
};
type ApiQuery = Record<string, string | number | boolean>;
type CreateFromApiItemOptions = {
  data: ApiEntityData;
  metadata?: ApiItemMetadata;
  relationships?: ApiItemRelationships;
};
type FetchListOptions = {
  query?: ApiQuery;
  page?: number | null;
  length?: number | null;
  endpoint?: string;
};
type FetchOptions = {
  identifier: string;
  endpoint?: string;
};
type PostOptions = {
  endpoint: string;
  payload?: Record<string, unknown>;
};
type PostEntityOptions = {
  endpoint: string;
  entity: AbstractApiEntity;
  query?: ApiQuery;
};
type PostEntitiesOptions = {
  endpoint: string;
  entities: AbstractApiEntity[];
  query?: ApiQuery;
};
type DeleteEntityOptions = {
  identifier: string | number;
  endpoint?: string;
  query?: ApiQuery;
  payload?: Record<string, unknown> | null;
};
type FetchListCachedByNameOptions<T extends AbstractApiEntity> = {
  cacheName: string;
  fetch: () => Promise<T[]>;
  ttlMs?: number | null;
  forceRefresh?: boolean;
};
type FetchCachedByNameOptions = {
  cacheName: string;
  secureId: string | number;
  endpoint?: string;
  ttlMs?: number | null;
  forceRefresh?: boolean;
};
type NamedListCacheEntry<T extends AbstractApiEntity> = {
  value?: T[];
  expiresAt: number | null;
  inFlight?: Promise<T[]>;
};
type NamedEntityCacheEntry<T extends AbstractApiEntity> = {
  value?: T;
  expiresAt: number | null;
  inFlight?: Promise<T>;
};
type FetchAllCachedOptions = {
  ttlMs?: number | null;
  forceRefresh?: boolean;
};

export default abstract class AbstractApiRepository<
  T extends AbstractApiEntity = AbstractApiEntity,
> {
  public static readonly CACHE_NAME_ALL = 'allOperators';
  public static readonly CACHE_TTL_DEFAULT: number | null = null;

  protected readonly client: AbstractApiEntitiesClient;
  private readonly namedListCache: Map<string, NamedListCacheEntry<T>> = new Map();
  private readonly namedEntityCache: Map<string, NamedEntityCacheEntry<T>> = new Map();

  constructor(client: AbstractApiEntitiesClient) {
    this.client = client;
  }

  async fetchAllCached(
    options: FetchAllCachedOptions = {}
  ): Promise<AbstractApiEntity[]> {
    const {
      ttlMs = AbstractApiRepository.CACHE_TTL_DEFAULT,
      forceRefresh = false,
    } = options;

    return this.fetchListCachedByName({
      cacheName: AbstractApiRepository.CACHE_NAME_ALL,
      ttlMs,
      forceRefresh,
      fetch: () => this.fetchList(),
    });
  }

  static getEntityType(): ApiEntityConstructor<AbstractApiEntity> {
    throw new Error('Repository must define getEntityType().');
  }

  static getEntityName(): string {
    // biome-ignore lint: keep subclass behavior via `this`.
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

  protected createFromApiItem(options: CreateFromApiItemOptions): T {
    const { data, metadata = [], relationships = [] } = options;
    const entityType = this.getEntityType();
    const entity = entityType.fromApi(data);

    entity.setMetadata(metadata);
    this.getEntityRegistry().registerEntity(entity);
    entity.setRelationships(this.buildRelationshipsForEntity(entity, entityType, data, relationships));

    return entity;
  }

  protected createFromApiCollection(collection: ApiEntityData[]): T[] {
    return collection.map((item) => {
      const [data, metadata, relationships] = this.splitApiItem(item);
      return this.createFromApiItem({ data, metadata, relationships });
    });
  }

  protected splitApiItem(
    item: ApiEntityData
  ): [ApiEntityData, ApiItemMetadata, ApiItemRelationships] {
    const apiItem = item as ApiItem;
    const data = apiItem.entity && typeof apiItem.entity === 'object' ? apiItem.entity : item;
    const metadata =
      apiItem.metadata && typeof apiItem.metadata === 'object' ? apiItem.metadata : [];
    const relationships =
      apiItem.relationships && typeof apiItem.relationships === 'object'
        ? apiItem.relationships
        : [];

    return [data, metadata, relationships];
  }

  protected buildRelationshipsForEntity(
    owner: AbstractApiEntity,
    entityType: ApiEntityConstructor<T>,
    data: ApiEntityData,
    relationships: ApiItemRelationships
  ): AbstractApiEntity[] {
    const schema = this.getEntitySchema(entityType);

    const output: AbstractApiEntity[] = [];

    for (const property of schema.properties) {
      if (!property || typeof property !== 'object') {
        continue;
      }

      const nameValue = (property as Record<string, unknown>)['name'];
      if (typeof nameValue !== 'string' || !nameValue) {
        throw new Error('[js-api] schema property missing name.');
      }
      const name = nameValue;

      const typeValue = (property as Record<string, unknown>)['type'];
      if (typeof typeValue !== 'string' || !typeValue) {
        throw new Error('[js-api] schema property missing type.');
      }

      // `relation` = single linked entity, `collection` = list of linked entities.
      if (typeValue !== 'relation' && typeValue !== 'collection') {
        continue;
      }
      const type = typeValue;

      const target = (property as Record<string, unknown>)['target'];
      if (typeof target !== 'string' || !target) {
        continue;
      }

      const apiFieldValue = (property as Record<string, unknown>)['apiField'];
      const apiField =
        typeof apiFieldValue === 'string' && apiFieldValue ? apiFieldValue : name;

      const value = data[apiField];

      if (type === 'relation') {
        const related = this.resolveRelationshipEntity(owner, target, value, relationships);
        if (related) {
          output.push(related);
        }
        continue;
      }

      const items = Array.isArray(value) ? value : value == null ? [] : [value];
      for (const item of items) {
        const related = this.resolveRelationshipEntity(owner, target, item, relationships);
        if (related) {
          output.push(related);
        }
      }
    }

    return output;
  }

  protected getEntitySchema(
    entityType: ApiEntityConstructor<T>
  ): ApiEntitySchema {
    const schema = entityType.retrieveEntitySchema();
    if (!schema || !Array.isArray(schema.properties)) {
      throw new Error('[js-api] schema missing or invalid for entity: ' + entityType.entityName);
    }

    return schema;
  }

  protected resolveRelationshipEntity(
    owner: AbstractApiEntity,
    target: string,
    value: unknown,
    relationships: ApiItemRelationships
  ): AbstractApiEntity | undefined {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      const [item, metadata, itemRelationships] = this.splitApiItem(value as ApiEntityData);
      const repository = this.client.getRepository(target) as AbstractApiRepository;
      return repository.createFromApiItem({
        data: item,
        metadata,
        relationships: itemRelationships,
      });
    }

    if (typeof value === 'string' && value && relationships && typeof relationships === 'object') {
      const relMap = relationships as Record<string, unknown>;
      const relEntry = relMap[value];
      if (relEntry && typeof relEntry === 'object' && !Array.isArray(relEntry)) {
        const [item, metadata, itemRelationships] = this.splitApiItem(relEntry as ApiEntityData);
        const repository = this.client.getRepository(target) as AbstractApiRepository;
        return repository.createFromApiItem({
          data: item,
          metadata,
          relationships: itemRelationships,
        });
      }
    }

    if (typeof value === 'string' && value) {
      const stub = new ApiEntityStub({ secureId: value, target });
      this.getEntityRegistry().registerStub(owner, stub);
      return stub;
    }

    return undefined;
  }

  public buildPath(pathSuffix: string): string {
    const entityName = (this.constructor as typeof AbstractApiRepository).getEntityName();
    const base = stringToKebabCase(entityName);
    return `${base}/${pathSuffix}`;
  }

  protected extractPayload(data: unknown): ApiEntityData {
    return extractPayloadData(data);
  }

  protected extractItems(payload: ApiEntityData): ApiEntityData[] {
    return extractItemsFromPayload(payload);
  }

  async fetchList(options: FetchListOptions = {}): Promise<T[]> {
    const { query = {}, page = null, length = null, endpoint = 'list' } = options;
    const searchParams: ApiQuery = { ...query };

    if (page !== null) {
      searchParams.page = page;
    }

    if (length !== null) {
      searchParams.length = length;
    }

    const data = await this.client
      .get({ path: this.buildPath(endpoint), options: { searchParams } })
      .json<unknown>();

    const payload = this.extractPayload(data);
    const items = this.extractItems(payload);

    return this.createFromApiCollection(items);
  }

  async fetchListCachedByName(
    options: FetchListCachedByNameOptions<T>
  ): Promise<T[]> {
    const {
      cacheName,
      fetch,
      ttlMs = AbstractApiRepository.CACHE_TTL_DEFAULT,
      forceRefresh = false,
    } = options;

    if (!cacheName) {
      throw new Error('cacheName is required for fetchListCachedByName().');
    }

    const now = Date.now();
    const previousEntry = this.namedListCache.get(cacheName);

    if (
      !forceRefresh &&
      previousEntry?.value &&
      this.isCacheEntryFresh(previousEntry, now)
    ) {
      return previousEntry.value;
    }

    if (!forceRefresh && previousEntry?.inFlight) {
      return previousEntry.inFlight;
    }

    const inFlight = (async () => {
      try {
        const list = await fetch();
        this.namedListCache.set(cacheName, {
          value: list,
          expiresAt: this.computeExpiresAt(ttlMs),
        });
        return list;
      } catch (error) {
        if (previousEntry) {
          this.namedListCache.set(cacheName, {
            value: previousEntry.value,
            expiresAt: previousEntry.expiresAt,
          });
        } else {
          this.namedListCache.delete(cacheName);
        }
        throw error;
      }
    })();

    this.namedListCache.set(cacheName, {
      value: previousEntry?.value,
      expiresAt: previousEntry?.expiresAt ?? null,
      inFlight,
    });

    return inFlight;
  }

  invalidateNamedListCache(cacheName: string): void {
    this.namedListCache.delete(cacheName);
  }

  clearNamedListCache(): void {
    this.namedListCache.clear();
  }

  async fetchCachedByName(
    options: FetchCachedByNameOptions
  ): Promise<T> {
    const {
      cacheName,
      secureId,
      endpoint = 'show',
      ttlMs = AbstractApiRepository.CACHE_TTL_DEFAULT,
      forceRefresh = false,
    } = options;

    if (!cacheName) {
      throw new Error('cacheName is required for fetchCachedByName().');
    }

    const identifier = String(secureId ?? '').trim();
    if (!identifier) {
      throw new Error('secureId is required for fetchCachedByName().');
    }

    const cacheKey = this.buildNamedEntityCacheKey(cacheName, endpoint, identifier);
    const now = Date.now();
    const previousEntry = this.namedEntityCache.get(cacheKey);

    if (
      !forceRefresh &&
      previousEntry?.value &&
      this.isCacheEntryFresh(previousEntry, now)
    ) {
      return previousEntry.value;
    }

    if (!forceRefresh && previousEntry?.inFlight) {
      return previousEntry.inFlight;
    }

    if (!forceRefresh) {
      const bridgedEntity = this.findCachedEntityBySecureId(identifier);
      if (bridgedEntity) {
        this.namedEntityCache.set(cacheKey, {
          value: bridgedEntity,
          expiresAt: this.computeExpiresAt(ttlMs),
        });

        return bridgedEntity;
      }
    }

    const inFlight = (async () => {
      try {
        const entity = await this.fetch({
          identifier,
          endpoint,
        });
        this.namedEntityCache.set(cacheKey, {
          value: entity,
          expiresAt: this.computeExpiresAt(ttlMs),
        });
        return entity;
      } catch (error) {
        if (previousEntry) {
          this.namedEntityCache.set(cacheKey, {
            value: previousEntry.value,
            expiresAt: previousEntry.expiresAt,
          });
        } else {
          this.namedEntityCache.delete(cacheKey);
        }
        throw error;
      }
    })();

    this.namedEntityCache.set(cacheKey, {
      value: previousEntry?.value,
      expiresAt: previousEntry?.expiresAt ?? null,
      inFlight,
    });

    return inFlight;
  }

  invalidateNamedEntityCache(
    cacheName: string,
    secureId?: string | number,
    endpoint = 'show'
  ): void {
    if (secureId === undefined || secureId === null || String(secureId).trim() === '') {
      const prefix = `${cacheName}::`;
      for (const key of this.namedEntityCache.keys()) {
        if (key.startsWith(prefix)) {
          this.namedEntityCache.delete(key);
        }
      }
      return;
    }

    const cacheKey = this.buildNamedEntityCacheKey(
      cacheName,
      endpoint,
      String(secureId).trim()
    );
    this.namedEntityCache.delete(cacheKey);
  }

  clearNamedEntityCache(): void {
    this.namedEntityCache.clear();
  }

  async fetch(options: FetchOptions): Promise<T> {
    const { identifier, endpoint = 'show' } = options;
    const data = await this.client
      .get({ path: this.buildPath(`${endpoint}/${encodeURIComponent(identifier)}`) })
      .json<unknown>();

    const payload = this.extractPayload(data);
    const [item, metadata, relationships] = this.splitApiItem(payload);

    return this.createFromApiItem({ data: item, metadata, relationships });
  }

  async post(options: PostOptions): Promise<unknown> {
    const { endpoint, payload = {} } = options;
    return this.client
      .post({
        path: this.buildPath(endpoint),
        options: { json: payload },
      })
      .json<unknown>();
  }

  async postEntity(options: PostEntityOptions): Promise<T> {
    const {
      endpoint,
      entity,
      query = {},
    } = options;
    const payload = entity.toApiPayload();

    const data = await this.client
      .post({
        path: this.buildPath(endpoint),
        options: {
          json: payload,
          searchParams: query,
        },
      })
      .json<unknown>();

    const responsePayload = this.extractPayload(data);
    const [item, metadata, relationships] = this.splitApiItem(responsePayload);

    return this.createFromApiItem({ data: item, metadata, relationships });
  }

  async createEntity(entity: T): Promise<T> {
    return this.postEntity({
      endpoint: 'create',
      entity,
    });
  }

  async postEntities(options: PostEntitiesOptions): Promise<T[]> {
    const {
      endpoint,
      entities,
      query = {},
    } = options;
    const payloads = entities.map((entity) => entity.toApiPayload());

    const data = await this.client
      .post({
        path: this.buildPath(endpoint),
        options: {
          json: {
            items: payloads,
          },
          searchParams: query,
        },
      })
      .json<unknown>();

    const responsePayload = this.extractPayload(data);
    const items = this.extractItems(responsePayload);
    return this.createFromApiCollection(items);
  }

  async createEntities(entities: T[]): Promise<T[]> {
    return this.postEntities({
      endpoint: 'create',
      entities,
    });
  }

  async deleteEntity(options: DeleteEntityOptions): Promise<unknown> {
    const {
      identifier,
      endpoint = 'delete',
      query = {},
      payload = null,
    } = options;
    const path = this.buildPath(`${endpoint}/${encodeURIComponent(String(identifier))}`);
    const requestOptions = payload === null
      ? { searchParams: query }
      : { searchParams: query, json: payload };

    return this.client
      .delete({
        path,
        options: requestOptions,
      })
      .json<unknown>();
  }

  protected getEntityRegistry(): ApiEntityRegistry {
    const client = this.client as unknown as { getEntityRegistry?: () => ApiEntityRegistry };
    if (typeof client.getEntityRegistry !== 'function') {
      throw new Error('Client must implement getEntityRegistry() for relationship hydration.');
    }

    return client.getEntityRegistry();
  }

  private computeExpiresAt(ttlMs: number | null): number | null {
    if (ttlMs === null) {
      return null;
    }

    return Date.now() + Math.max(0, ttlMs);
  }

  private isCacheEntryFresh(
    entry: Pick<NamedListCacheEntry<T>, 'expiresAt'> | Pick<NamedEntityCacheEntry<T>, 'expiresAt'>,
    now: number
  ): boolean {
    return entry.expiresAt === null || entry.expiresAt > now;
  }

  private buildNamedEntityCacheKey(
    cacheName: string,
    endpoint: string,
    secureId: string
  ): string {
    return `${cacheName}::${endpoint}::${secureId}`;
  }

  private findCachedEntityBySecureId(secureId: string): T | undefined {
    const entityType = this.getEntityType();
    const fromRegistry = this.getEntityRegistry().resolve(entityType.entityName, secureId);
    if (fromRegistry) {
      return fromRegistry as T;
    }

    for (const entry of this.namedListCache.values()) {
      if (!entry.value) {
        continue;
      }

      const matched = entry.value.find((entity) => entity?.secureId === secureId);
      if (matched) {
        return matched;
      }
    }

    return undefined;
  }
}
