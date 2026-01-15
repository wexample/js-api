import type AbstractApiEntitiesClient from './AbstractApiEntitiesClient';
import AbstractApiEntity, {
  type ApiEntityConstructor,
  type ApiEntityData,
} from './AbstractApiEntity';

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

  protected createFromApiItem(options: CreateFromApiItemOptions): T {
    const { data, metadata = [], relationships = [] } = options;
    const entityType = this.getEntityType();
    const entity = entityType.fromApi(data);

    entity.setMetadata(metadata);
    entity.setRelationships(this.createRelationships(relationships));

    return entity;
  }

  protected createFromApiCollection(collection: ApiEntityData[]): T[] {
    return collection.map((item) => {
      const [data, metadata, relationships] = this.splitApiItem(item);
      return this.createFromApiItem({ data, metadata, relationships });
    });
  }

  protected splitApiItem(item: ApiEntityData): [ApiEntityData, ApiItemMetadata, ApiItemRelationships] {
    const apiItem = item as ApiItem;
    const data =
      apiItem.entity && typeof apiItem.entity === 'object' ? apiItem.entity : item;
    const metadata =
      apiItem.metadata && typeof apiItem.metadata === 'object' ? apiItem.metadata : [];
    const relationships =
      apiItem.relationships && typeof apiItem.relationships === 'object'
        ? apiItem.relationships
        : [];

    return [data, metadata, relationships];
  }

  protected createRelationships(relationships: ApiItemRelationships): AbstractApiEntity[] {
    if (!Array.isArray(relationships)) {
      return [];
    }

    const output: AbstractApiEntity[] = [];

    for (const relationship of relationships) {
      if (!relationship || typeof relationship !== 'object' || Array.isArray(relationship)) {
        continue;
      }

      const entry = relationship as Record<string, unknown>;
      const type = entry['type'];

      if (typeof type !== 'string' || !type) {
        continue;
      }

      const data = entry['entity'] ?? entry['data'] ?? entry;

      if (!data || typeof data !== 'object' || Array.isArray(data)) {
        continue;
      }

      delete (data as Record<string, unknown>)['type'];

      const repository = this.client.getRepository(type);
      const entityType = repository.getEntityType();
      output.push(entityType.fromApi(data as ApiEntityData));
    }

    return output;
  }

  public buildPath(pathSuffix: string): string {
    const entityName = (this.constructor as typeof AbstractApiRepository).getEntityName();
    return `${entityName}/${pathSuffix}`;
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
    const {
      query = {},
      page = null,
      length = null,
      endpoint = 'list',
    } = options;
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

  async fetch(options: FetchOptions): Promise<T> {
    const { identifier, endpoint = 'show' } = options;
    const data = await this.client
      .get({ path: this.buildPath(`${endpoint}/${encodeURIComponent(identifier)}`) })
      .json<unknown>();

    const payload = this.extractPayload(data);
    const [item, metadata, relationships] = this.splitApiItem(payload);

    return this.createFromApiItem({ data: item, metadata, relationships });
  }
}
