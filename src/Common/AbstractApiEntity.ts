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

import {
  getPropertyApiField,
  getSchemaPropertyByApiField,
  getSchemaPropertyByName,
  isPropertySerializable,
  isPropertyWritable,
} from '../Helper/ApiEntitySchemaHelper.js';
import { normalizeIncomingValue, serializeOutgoingValue } from '../Helper/ApiEntityValueHelper.js';
import { lowerFirstCharacter } from '../Helper/EntityNameHelper.js';
import ApiSchemaError from './Errors/ApiSchemaError.js';

export type ApiEntitySetOptions = {
  // Privileged write used by API hydration: bypasses the read-only guard,
  // never the schema itself (an unknown property always throws).
  system?: boolean;
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
      // biome-ignore lint/correctness/noConstructorReturn: returning a Proxy from the constructor is intentional
      return AbstractApiEntity.createProxy(this);
    }
  }

  static fromApi<T extends AbstractApiEntity>(this: ApiEntityConstructor<T>, data: ApiEntityData): T {
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
        if (targetName && stubTargetName && targetName === stubTargetName) {
          return entity;
        }
      }

      return relationship;
    });
  }

  getRelationship(name: string): AbstractApiEntity | undefined {
    for (const relationship of this.relationships) {
      const relationshipConstructor = relationship.constructor as typeof AbstractApiEntity;
      const entityName = relationship.entityName;
      if (!entityName) {
        throw new Error('[js-api] relationship missing entityName');
      }

      if (entityName === name || relationshipConstructor.name === name) {
        return relationship;
      }

      const stubTargetName = (relationship as { targetName?: string }).targetName;
      if (stubTargetName && stubTargetName === name) {
        return relationship;
      }
    }

    return undefined;
  }

  getRelationships(name: string): AbstractApiEntity[] {
    return this.relationships.filter((relationship) => {
      const relationshipConstructor = relationship.constructor as typeof AbstractApiEntity;
      const entityName = relationship.entityName;
      if (!entityName) {
        throw new Error('[js-api] relationship missing entityName');
      }

      if (entityName === name || relationshipConstructor.name === name) {
        return true;
      }

      const stubTargetName = (relationship as { targetName?: string }).targetName;
      return !!stubTargetName && stubTargetName === name;
    });
  }

  findRelationship(secureId: string): AbstractApiEntity | undefined {
    return this.relationships.find((relationship) => relationship.secureId === secureId);
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

  // Hydrates from an API payload through the same gate as set(): every
  // response key must match a schema property (by its wire name) — an
  // unknown key means the API contract drifted and throws.
  assignFromApi(data: ApiEntityData): void {
    const schemaProperties = this.getSchemaProperties();

    for (const [apiField, value] of Object.entries(data)) {
      const property = getSchemaPropertyByApiField(schemaProperties, apiField);

      if (!property) {
        throw new ApiSchemaError({
          message: `[js-api] field not allowed by schema (${this.entityName}): ${apiField}`,
          code: ApiSchemaError.CODE_UNKNOWN_FIELD,
          entityName: this.entityName,
          field: apiField,
        });
      }

      this.set(property.name, value, { system: true });
    }
  }

  set(name: string, value: unknown, options: ApiEntitySetOptions = {}): void {
    const property = getSchemaPropertyByName(this.getSchemaProperties(), name);
    if (!property) {
      throw new ApiSchemaError({
        message: `[js-api] unknown property "${name}" on entity "${this.entityName}".`,
        code: ApiSchemaError.CODE_UNKNOWN_FIELD,
        entityName: this.entityName,
        field: name,
      });
    }

    if (!options.system && !isPropertyWritable(property)) {
      throw new ApiSchemaError({
        message: `[js-api] property "${name}" is read-only on entity "${this.entityName}".`,
        code: ApiSchemaError.CODE_READ_ONLY_FIELD,
        entityName: this.entityName,
        field: name,
      });
    }

    this.setDataValue(name, normalizeIncomingValue(property, value));
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
      if (!isPropertySerializable(property) || !isPropertyWritable(property)) {
        continue;
      }

      if (!(property.name in this.data)) {
        continue;
      }

      output[getPropertyApiField(property)] = serializeOutgoingValue(
        property,
        this.data[property.name]
      );
    }

    return output;
  }

  protected getSchemaProperties(): ApiEntitySchemaProperty[] {
    const entityType = this.constructor as typeof AbstractApiEntity;
    const schema = entityType.retrieveEntitySchema();
    return schema.properties as ApiEntitySchemaProperty[];
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

              const fieldName = lowerFirstCharacter(name);
              return obj.getDataValue(fieldName);
            };
          }
        }

        return value;
      },
    });
  }
}
