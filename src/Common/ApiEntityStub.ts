import AbstractApiEntity, { type ApiEntityData } from './AbstractApiEntity.js';

export default class ApiEntityStub extends AbstractApiEntity {
  static readonly entityName = 'stub';

  targetName: string;

  constructor(data: ApiEntityData = {}) {
    super(data);
    this.targetName = data['target'] as string;
  }

  isStub(): boolean {
    return true;
  }
}
