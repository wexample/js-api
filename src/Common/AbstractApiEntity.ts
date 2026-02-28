export type ApiEntityData = Record<string, unknown>;
export type ApiEntityMetadata = Record<string, unknown> | unknown[];
export type ApiEntitySchemaProperty = {
  name: string;
  type?: string;
  apiField?: string;
  writable?: boolean;
  readOnly?: boolean;
  serializable?: boolean;
};
export type ApiEntitySchema = {
  name: string;
  properties: unknown[];
};

export type ApiEntityConstructor<T extends AbstractApiEntity> = {
  new (data?: ApiEntityData): T;
  readonly entityName: string;
  retrieveEntitySchema(): ApiEntitySchema;
  fromApi(data: ApiEntityData): T;
  fromApiCollection(collection: ApiEntityData[]): T[];
};

export default abstract class AbstractApiEntity {
  static readonly entityName: string;
  secureId?: string;
  readonly entityName?: string;
  metadata: ApiEntityMetadata;
  relationships: AbstractApiEntity[];
  protected readonly data: ApiEntityData;

  constructor(data: ApiEntityData = {}) {
    this.data = {};
    this.secureId = undefined;
    this.metadata = [];
    this.relationships = [];
    this.entityName = (this.constructor as typeof AbstractApiEntity).entityName;
    this.patch(data);

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
    const entity = new this();
    entity.assignFromApi(data);
    return entity;
  }

  static fromApiCollection<T extends AbstractApiEntity>(
    this: ApiEntityConstructor<T>,
    collection: ApiEntityData[]
  ): T[] {
    // biome-ignore lint: keep subclass behavior via `this`.
    return collection.map((item) => this.fromApi(item));
  }

  static retrieveEntitySchema(): ApiEntitySchema {
    throw new Error('Entity must define static retrieveEntitySchema().');
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
    const property = `${name}SecureId`;
    const value = this.getDataValue(property);

    return typeof value === 'string' ? value : undefined;
  }

  setDataValue(name: string, value: unknown): void {
    this.data[name] = value;

    if (name === 'secureId') {
      this.secureId = typeof value === 'string' ? value : undefined;
    }
  }

  getDataValue(name: string): unknown {
    return this.data[name];
  }

  getData(): Readonly<ApiEntityData> {
    return this.data;
  }

  assignFromApi(data: ApiEntityData): void {
    const schemaProperties = this.getSchemaProperties();
    for (const property of schemaProperties) {
      const apiField = property.apiField && property.apiField ? property.apiField : property.name;
      if (!(apiField in data)) {
        continue;
      }

      this.setDataValue(property.name, this.normalizeIncomingValue(property, data[apiField]));
    }
  }

  set(name: string, value: unknown): void {
    const property = this.getSchemaPropertyByName(name);
    if (!this.isPropertyWritable(property)) {
      throw new Error(`[js-api] property "${name}" is read-only on entity "${this.entityName}".`);
    }

    this.setDataValue(name, this.normalizeIncomingValue(property, value));
  }

  patch(data: ApiEntityData): void {
    for (const [name, value] of Object.entries(data)) {
      this.set(name, value);
    }
  }

  toApiPayload(): ApiEntityData {
    const output: ApiEntityData = {};
    const schemaProperties = this.getSchemaProperties();
    for (const property of schemaProperties) {
      if (!this.isPropertySerializable(property) || !this.isPropertyWritable(property)) {
        continue;
      }

      const type = this.normalizePropertyType(property.type);
      if (type === 'relation' || type === 'collection') {
        continue;
      }

      if (!(property.name in this.data)) {
        continue;
      }

      const apiField = property.apiField && property.apiField ? property.apiField : property.name;
      output[apiField] = this.serializeOutgoingValue(property, this.data[property.name]);
    }

    return output;
  }

  protected normalizeIncomingValue(
    property: ApiEntitySchemaProperty,
    value: unknown
  ): unknown {
    if (value === null || value === undefined) {
      return null;
    }

    switch (this.normalizePropertyType(property.type)) {
      case 'datetime': {
        if (value instanceof Date) {
          return Number.isNaN(value.getTime()) ? null : value;
        }
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

  protected serializeOutgoingValue(
    property: ApiEntitySchemaProperty,
    value: unknown
  ): unknown {
    if (value === undefined) {
      return null;
    }

    if (value === null) {
      return null;
    }

    switch (this.normalizePropertyType(property.type)) {
      case 'datetime': {
        if (value instanceof Date) {
          return Number.isNaN(value.getTime()) ? null : value.toISOString();
        }
        const date = new Date(String(value));
        return Number.isNaN(date.getTime()) ? null : date.toISOString();
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

  protected normalizePropertyType(type: unknown): string {
    if (typeof type !== 'string') {
      return '';
    }

    const lowered = type.toLowerCase();
    if (lowered === 'datetimeinterface' || lowered === 'date') {
      return 'datetime';
    }

    return lowered;
  }

  protected getSchemaPropertyByName(name: string): ApiEntitySchemaProperty {
    for (const property of this.getSchemaProperties()) {
      if (property.name === name) {
        return property;
      }
    }

    throw new Error(`[js-api] unknown property "${name}" on entity "${this.entityName}".`);
  }

  protected isPropertyWritable(property: ApiEntitySchemaProperty): boolean {
    if (property.writable === false) {
      return false;
    }

    return property.readOnly !== true;
  }

  protected isPropertySerializable(property: ApiEntitySchemaProperty): boolean {
    return property.serializable !== false;
  }

  protected getSchemaProperties(): ApiEntitySchemaProperty[] {
    const entityType = this.constructor as typeof AbstractApiEntity;
    const schema = entityType.retrieveEntitySchema();
    return schema.properties as ApiEntitySchemaProperty[];
  }

  protected static normalizeRelationshipName(name: string): string {
    return name.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase();
  }

  protected static lowerFirstCharacter(value: string): string {
    if (!value) {
      return value;
    }

    return value[0].toLowerCase() + value.slice(1);
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

        const dataValue = obj.getDataValue(prop);
        if (dataValue !== undefined) {
          return dataValue;
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
              if (many.length) {
                return many;
              }

              const fieldName = AbstractApiEntity.lowerFirstCharacter(name);
              return obj.getDataValue(fieldName);
            };
          }
        }

        return value;
      },
    });
  }
}
