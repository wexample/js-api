import AbstractApiEntity, {
  type ApiEntityData,
  type ApiEntitySchema,
} from './AbstractApiEntity.js';

export default class ApiEntityStub extends AbstractApiEntity {
  static readonly entityName = 'stub';
  static readonly schema: ApiEntitySchema = {
    name: 'stub',
    properties: [{ name: 'secureId', type: 'string' }],
  };

  targetName: string;

  constructor(data: ApiEntityData = {}) {
    super({ secureId: data['secureId'] as string | undefined });
    this.targetName = data['target'] as string;
  }

  static retrieveEntitySchema(): ApiEntitySchema {
    return ApiEntityStub.schema;
  }

  isStub(): boolean {
    return true;
  }
}
