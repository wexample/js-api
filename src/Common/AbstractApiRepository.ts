import type AbstractApiEntitiesClient from './AbstractApiEntitiesClient.js';
import AbstractApiEntity, {
  type ApiEntityConstructor,
  type ApiEntityData,
} from './AbstractApiEntity.js';
import type ApiEntityRegistry from './ApiEntityRegistry.js';
import { stringToKebabCase } from '@wexample/js-helpers/Helper/String';

type RepositoryClass<T extends AbstractApiEntity> = {
  getEntityType(): ApiEntityConstructor<T>;
};

type ApiItemMetadata = Record<string, unknown> | unknown[];
type ApiItemRelationships = Record<string, ApiItem>;
type ApiItem = {
  type: string;
  entity: ApiEntityData;
  metadata: ApiItemMetadata;
  relationships: ApiItemRelationships;
};
type ApiQuery = Record<string, string | number | boolean>;
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
type PostEntityBySecureIdOptions = {
  endpoint: string;
  entity: AbstractApiEntity;
  secureId?: string | number;
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
  cacheName?: string;
  fetch: () => Promise<T[]>;
  ttlMs?: number | null;
  forceRefresh?: boolean;
};
type FetchCachedByNameOptions = {
  cacheName?: string;
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
  cacheName?: string;
  ttlMs?: number | null;
  forceRefresh?: boolean;
};

export default abstract class AbstractApiRepository<
  T extends AbstractApiEntity = AbstractApiEntity,
> {
  public static readonly CACHE_NAME_ALL = 'all';
  public static readonly CACHE_NAME_ENTITY = 'entity';
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
      cacheName,
      ttlMs = AbstractApiRepository.CACHE_TTL_DEFAULT,
      forceRefresh = false,
    } = options;
    const resolvedCacheName = cacheName?.trim() || this.getDefaultListCacheName();

    return this.fetchListCachedByName({
      cacheName: resolvedCacheName,
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

  public createFromApiItem(item: ApiItem): T {
    const entityType = this.getEntityType();
    this.assertApiItemType(item, entityType);
    const entity = entityType.fromApi(item.entity);
    const createdRelationships = this.createRelationships(item.relationships);

    entity.setMetadata(item.metadata);
    this.getEntityRegistry().registerEntity(entity);
    entity.setRelationships(createdRelationships);

    return entity;
  }

  protected createFromApiCollection(collection: ApiItem[]): T[] {
    return collection.map((item) => {
      return this.createFromApiItem(item);
    });
  }

  protected assertApiItemType(
    item: ApiItem,
    entityType: ApiEntityConstructor<T>
  ): void {
    if (item.type !== entityType.entityName) {
      throw new Error(
        `API item type mismatch: expected "${entityType.entityName}", got "${item.type}".`
      );
    }
  }

  protected createRelationships(
    relationships: ApiItemRelationships
  ): AbstractApiEntity[] {
    const output: AbstractApiEntity[] = [];

    for (const [, relEntry] of Object.entries(relationships)) {
      const repository = this.client.getRepository(relEntry.type) as AbstractApiRepository;

      output.push(repository.createFromApiItem(relEntry));
    }

    return output;
  }

  public buildPath(pathSuffix: string): string {
    const entityName = (this.constructor as typeof AbstractApiRepository).getEntityName();
    const base = stringToKebabCase(entityName);
    return `${base}/${pathSuffix}`;
  }

  protected extractPayload(data: unknown): ApiEntityData {
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      throw new Error('Invalid API response: expected an object containing a "data" object.');
    }

    const record = data as Record<string, unknown>;
    const payload = record.data;

    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      throw new Error('Invalid API response: missing or invalid "data" object.');
    }

    return payload as ApiEntityData;
  }

  protected extractItems(payload: ApiEntityData): ApiItem[] {
    const items = (payload as Record<string, unknown>).items;

    if (!Array.isArray(items)) {
      throw new Error('Invalid API payload: missing "items" array.');
    }

    return items.map((item) => this.parseApiItem(item));
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
    const resolvedCacheName = cacheName?.trim() || this.getDefaultListCacheName();

    const now = Date.now();
    const previousEntry = this.namedListCache.get(resolvedCacheName);

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
        this.namedListCache.set(resolvedCacheName, {
          value: list,
          expiresAt: this.computeExpiresAt(ttlMs),
        });
        return list;
      } catch (error) {
        if (previousEntry) {
          this.namedListCache.set(resolvedCacheName, {
            value: previousEntry.value,
            expiresAt: previousEntry.expiresAt,
          });
        } else {
          this.namedListCache.delete(resolvedCacheName);
        }
        throw error;
      }
    })();

    this.namedListCache.set(resolvedCacheName, {
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

  async fetchCached(
    options: FetchCachedByNameOptions
  ): Promise<T> {
    const {
      cacheName,
      secureId,
      endpoint = 'show',
      ttlMs = AbstractApiRepository.CACHE_TTL_DEFAULT,
      forceRefresh = false,
    } = options;
    const resolvedCacheName = cacheName?.trim() || this.getDefaultEntityCacheName();

    const identifier = String(secureId ?? '').trim();
    if (!identifier) {
      throw new Error('secureId is required for fetchCached().');
    }

    const cacheKey = this.buildNamedEntityCacheKey(resolvedCacheName, endpoint, identifier);
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
    const item = this.parseApiItem(payload);
    return this.createFromApiItem(item);
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
    const item = this.parseApiItem(responsePayload);
    return this.createFromApiItem(item);
  }

  async postEntityBySecureId(options: PostEntityBySecureIdOptions): Promise<T> {
    const {
      endpoint,
      entity,
      secureId,
      query = {},
    } = options;
    const resolvedSecureId = String(secureId ?? entity.secureId ?? '').trim();

    if (!resolvedSecureId) {
      throw new Error('Missing secureId for postEntityBySecureId().');
    }

    const payload = entity.toApiPayload();

    const data = await this.client
      .post({
        path: this.buildPath(`${endpoint}/${encodeURIComponent(resolvedSecureId)}`),
        options: {
          json: payload,
          searchParams: query,
        },
      })
      .json<unknown>();

    const responsePayload = this.extractPayload(data);
    const item = this.parseApiItem(responsePayload);
    return this.createFromApiItem(item);
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
            entities: payloads,
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

  private getDefaultListCacheName(): string {
    return `${this.getEntityType().entityName}::${AbstractApiRepository.CACHE_NAME_ALL}`;
  }

  private getDefaultEntityCacheName(): string {
    return `${this.getEntityType().entityName}::${AbstractApiRepository.CACHE_NAME_ENTITY}`;
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

  private parseApiItem(value: unknown): ApiItem {
    return value as ApiItem;
  }
}
