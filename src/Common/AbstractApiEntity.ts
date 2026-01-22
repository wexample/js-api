export type ApiEntityData = Record<string, unknown>;
export type ApiEntityMetadata = Record<string, unknown> | unknown[];

export type ApiEntityConstructor<T extends AbstractApiEntity> = {
  new (data?: ApiEntityData): T;
  readonly entityName: string;
  fromApi(data: ApiEntityData): T;
  fromApiCollection(collection: ApiEntityData[]): T[];
};

export default abstract class AbstractApiEntity {
  static readonly entityName: string;
  secureId?: string;
  metadata: ApiEntityMetadata;
  relationships: AbstractApiEntity[];

  protected constructor(data: ApiEntityData = {}) {
    this.secureId = data.secureId as string | undefined;
    this.metadata = [];
    this.relationships = [];
  }

  static fromApi<T extends AbstractApiEntity>(
    this: ApiEntityConstructor<T>,
    data: ApiEntityData
  ): T {
    return new this(data);
  }

  static fromApiCollection<T extends AbstractApiEntity>(
    this: ApiEntityConstructor<T>,
    collection: ApiEntityData[]
  ): T[] {
    return collection.map((item) => this.fromApi(item));
  }

  setMetadata(metadata: ApiEntityMetadata): void {
    this.metadata = metadata;
  }

  setRelationships(relationships: AbstractApiEntity[]): void {
    this.relationships = relationships;
  }

  getRelationship(name: string): AbstractApiEntity | undefined {
    const normalizedTarget = AbstractApiEntity.normalizeRelationshipName(name);

    for (const relationship of this.relationships) {
      const relationshipConstructor = relationship.constructor as typeof AbstractApiEntity;
      const entityName = relationshipConstructor.entityName;

      if (
        AbstractApiEntity.normalizeRelationshipName(entityName) === normalizedTarget ||
        AbstractApiEntity.normalizeRelationshipName(relationshipConstructor.name) === normalizedTarget
      ) {
        return relationship;
      }
    }

    return undefined;
  }

  getSecureIdFor(name: string): string | undefined {
    const property = `${name}SecureId` as keyof this;
    const value = this[property];

    return typeof value === 'string' ? value : undefined;
  }

  private static normalizeRelationshipName(name: string): string {
    return name.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase();
  }
}
