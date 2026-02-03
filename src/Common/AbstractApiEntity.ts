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
  readonly entityName?: string;
  metadata: ApiEntityMetadata;
  relationships: AbstractApiEntity[];

  protected constructor(data: ApiEntityData = {}) {
    this.secureId = data.secureId as string | undefined;
    this.metadata = [];
    this.relationships = [];
    this.entityName = (this.constructor as typeof AbstractApiEntity).entityName;

    // Allow dynamic getX()/getXSecureId() via Proxy, similar to PHP __call.
    if ((this.constructor as typeof AbstractApiEntity).useProxy) {
      return AbstractApiEntity.createProxy(this);
    }
  }

  static fromApi<T extends AbstractApiEntity>(
    this: ApiEntityConstructor<T>,
    data: ApiEntityData
  ): T {
    // biome-ignore lint: keep subclass instantiation with `this`.
    return new this(data);
  }

  static fromApiCollection<T extends AbstractApiEntity>(
    this: ApiEntityConstructor<T>,
    collection: ApiEntityData[]
  ): T[] {
    // biome-ignore lint: keep subclass behavior via `this`.
    return collection.map((item) => this.fromApi(item));
  }

  setMetadata(metadata: ApiEntityMetadata): void {
    this.metadata = metadata;
  }

  setRelationships(relationships: AbstractApiEntity[]): void {
    this.relationships = relationships;
  }

  isStub(): boolean {
    return false;
  }

  replaceRelationship(stub: AbstractApiEntity, entity: AbstractApiEntity): void {
    this.relationships = this.relationships.map((relationship) => {
      if (relationship === stub) {
        return entity;
      }

      if (
        relationship.isStub?.() &&
        relationship.secureId &&
        relationship.secureId === stub.secureId
      ) {
        const targetName = (relationship as { targetName?: string }).targetName;
        const stubTargetName = (stub as { targetName?: string }).targetName;
        if (
          targetName &&
          stubTargetName &&
          AbstractApiEntity.normalizeRelationshipName(targetName) ===
            AbstractApiEntity.normalizeRelationshipName(stubTargetName)
        ) {
          return entity;
        }
      }

      return relationship;
    });
  }

  getRelationship(name: string): AbstractApiEntity | undefined {
    const normalizedTarget = AbstractApiEntity.normalizeRelationshipName(name);

    for (const relationship of this.relationships) {
      const relationshipConstructor = relationship.constructor as typeof AbstractApiEntity;
      const entityName = relationship.entityName;
      if (!entityName) {
        throw new Error('[js-api] relationship missing entityName');
      }

      if (
        AbstractApiEntity.normalizeRelationshipName(entityName) === normalizedTarget ||
        AbstractApiEntity.normalizeRelationshipName(relationshipConstructor.name) ===
          normalizedTarget
      ) {
        return relationship;
      }

      const stubTargetName = (relationship as { targetName?: string }).targetName;
      if (
        stubTargetName &&
        AbstractApiEntity.normalizeRelationshipName(stubTargetName) === normalizedTarget
      ) {
        return relationship;
      }
    }

    return undefined;
  }

  getRelationships(name: string): AbstractApiEntity[] {
    const normalizedTarget = AbstractApiEntity.normalizeRelationshipName(name);

    return this.relationships.filter((relationship) => {
      const relationshipConstructor = relationship.constructor as typeof AbstractApiEntity;
      const entityName = relationship.entityName;
      if (!entityName) {
        throw new Error('[js-api] relationship missing entityName');
      }

      if (
        AbstractApiEntity.normalizeRelationshipName(entityName) === normalizedTarget ||
        AbstractApiEntity.normalizeRelationshipName(relationshipConstructor.name) ===
          normalizedTarget
      ) {
        return true;
      }

      const stubTargetName = (relationship as { targetName?: string }).targetName;
      return (
        !!stubTargetName &&
        AbstractApiEntity.normalizeRelationshipName(stubTargetName) === normalizedTarget
      );
    });
  }

  getSecureIdFor(name: string): string | undefined {
    const property = `${name}SecureId` as keyof this;
    const value = this[property];

    return typeof value === 'string' ? value : undefined;
  }

  protected static normalizeRelationshipName(name: string): string {
    return name.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase();
  }

  static useProxy = true;

  private static createProxy<T extends AbstractApiEntity>(target: T): T {
    return new Proxy(target, {
      get(obj, prop, receiver) {
        const value = Reflect.get(obj, prop, receiver);
        if (typeof value === 'function') {
          return value.bind(obj);
        }

        if (typeof prop !== 'string') {
          return value;
        }

        if (value !== undefined) {
          return value;
        }

        if (prop.startsWith('get') && prop.length > 3) {
          if (prop.endsWith('SecureId')) {
            const name = prop.slice(3, -8);
            return () => {
              const relationship = obj.getRelationship(name);
              if (relationship?.secureId) {
                return relationship.secureId;
              }

              return obj.getSecureIdFor(name);
            };
          }

          if (prop !== 'getRelationship' && prop !== 'getRelationships') {
            const name = prop.slice(3);
            return () => {
              const single = obj.getRelationship(name);
              if (single !== undefined) {
                return single;
              }

              const many = obj.getRelationships(name);
              return many.length ? many : undefined;
            };
          }
        }

        return value;
      },
    });
  }
}
