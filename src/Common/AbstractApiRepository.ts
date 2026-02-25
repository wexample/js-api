import type AbstractApiEntitiesClient from './AbstractApiEntitiesClient.js';
import AbstractApiEntity, {
  type ApiEntityConstructor,
  type ApiEntityData,
} from './AbstractApiEntity.js';
import ApiEntityStub from './ApiEntityStub.js';
import type ApiEntityRegistry from './ApiEntityRegistry.js';
import { stringToKebabCase } from '@wexample/js-helpers/Helper/String';

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
type ApiPayload = Record<string, unknown> & { items?: ApiEntityData[] };
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
type CreateEntityOptions = {
  payload?: Record<string, unknown>;
  endpoint?: string;
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
type NamedListCacheEntry<T extends AbstractApiEntity> = {
  value?: T[];
  expiresAt: number | null;
  inFlight?: Promise<T[]>;
};

export default abstract class AbstractApiRepository<
  T extends AbstractApiEntity = AbstractApiEntity,
> {
  protected readonly client: AbstractApiEntitiesClient;
  private readonly namedListCache: Map<string, NamedListCacheEntry<T>> = new Map();

  constructor(client: AbstractApiEntitiesClient) {
    this.client = client;
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

    this.hydrateEntityFields(entity, entityType, data);
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

  protected hydrateEntityFields(
    entity: AbstractApiEntity,
    entityType: ApiEntityConstructor<T>,
    data: ApiEntityData
  ): void {
    const schema = this.getEntitySchema(entityType);

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
      const type = typeValue.toLowerCase();

      const apiFieldValue = (property as Record<string, unknown>)['apiField'];
      const apiField =
        typeof apiFieldValue === 'string' && apiFieldValue ? apiFieldValue : name;

      if (!(apiField in data)) {
        continue;
      }

      const rawValue = data[apiField];
      const value = this.normalizeFieldValue(type, rawValue);
      (entity as unknown as Record<string, unknown>)[name] = value;
    }
  }

  protected normalizeFieldValue(type: string, value: unknown): unknown {
    if (value === null || value === undefined) {
      return null;
    }

    switch (type) {
      case 'datetime': {
        const date = new Date(String(value));
        return Number.isNaN(date.getTime()) ? null : date;
      }
      case 'integer': {
        const num = Number(value);
        return Number.isNaN(num) ? null : Math.trunc(num);
      }
      case 'float':
      case 'double':
      case 'decimal': {
        const num = Number(value);
        return Number.isNaN(num) ? null : num;
      }
      case 'boolean':
        return typeof value === 'boolean' ? value : Boolean(value);
      case 'string':
        return String(value);
      default:
        return value;
    }
  }

  protected getEntitySchema(
    entityType: ApiEntityConstructor<T>
  ): { properties: unknown[] } {
    const schemas = this.getEntitySchemas();
    const schema = schemas[entityType.entityName] as { properties?: unknown[] } | undefined;

    if (!schema || !Array.isArray(schema.properties)) {
      throw new Error('[js-api] schema missing or invalid for entity: ' + entityType.entityName);
    }

    return { properties: schema.properties };
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
    if (data && typeof data === 'object' && !Array.isArray(data)) {
      const record = data as Record<string, unknown>;
      const payload = record['data'];

      if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
        return payload as ApiEntityData;
      }

      return record as ApiEntityData;
    }

    return {};
  }

  protected extractItems(payload: ApiEntityData): ApiEntityData[] {
    const items = (payload as ApiPayload)['items'];
    return Array.isArray(items) ? items : [];
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
      ttlMs = null,
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

  async createEntity(options: CreateEntityOptions = {}): Promise<T> {
    const {
      payload = {},
      endpoint = 'create',
      query = {},
    } = options;

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

  protected getEntitySchemas(): Record<string, unknown> {
    const client = this.client as unknown as { getEntitySchemas?: () => Record<string, unknown> };
    if (typeof client.getEntitySchemas !== 'function') {
      throw new Error('Client must implement getEntitySchemas() to hydrate relationships.');
    }

    return client.getEntitySchemas();
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
    entry: NamedListCacheEntry<T>,
    now: number
  ): boolean {
    return entry.expiresAt === null || entry.expiresAt > now;
  }
}
