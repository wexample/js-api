import type AbstractApiEntity from './AbstractApiEntity.js';
import ApiEntityStub from './ApiEntityStub.js';

type StubEntry = {
  owner: AbstractApiEntity;
  stub: ApiEntityStub;
};

export default class ApiEntityRegistry {
  private entities: Map<string, Map<string, AbstractApiEntity>> = new Map();
  private stubs: Map<string, Map<string, StubEntry[]>> = new Map();

  registerEntity(entity: AbstractApiEntity): void {
    const secureId = entity.secureId;
    if (!secureId) {
      return;
    }

    const entityName = this.normalizeName(entity.entityName);
    if (!entityName) {
      throw new Error('[js-api] entityName missing on entity instance.');
    }

    if (!this.entities.has(entityName)) {
      this.entities.set(entityName, new Map());
    }

    this.entities.get(entityName)?.set(secureId, entity);

    const waiters = this.stubs.get(entityName)?.get(secureId);
    if (!waiters) {
      return;
    }

    for (const entry of waiters) {
      entry.owner.replaceRelationship(entry.stub, entity);
    }

    this.stubs.get(entityName)?.delete(secureId);
  }

  registerStub(owner: AbstractApiEntity, stub: ApiEntityStub): void {
    const secureId = stub.secureId;
    if (!secureId) {
      return;
    }

    const entityName = this.normalizeName(stub.targetName);
    const existing = this.entities.get(entityName)?.get(secureId);
    if (existing) {
      owner.replaceRelationship(stub, existing);
      return;
    }

    if (!this.stubs.has(entityName)) {
      this.stubs.set(entityName, new Map());
    }

    if (!this.stubs.get(entityName)?.has(secureId)) {
      this.stubs.get(entityName)?.set(secureId, []);
    }

    this.stubs.get(entityName)?.get(secureId)?.push({
      owner,
      stub,
    });
  }

  resolve(entityName: string, secureId: string): AbstractApiEntity | undefined {
    return this.entities.get(this.normalizeName(entityName))?.get(secureId);
  }

  private normalizeName(name?: string): string {
    if (!name) {
      return '';
    }

    return name.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase();
  }
}
