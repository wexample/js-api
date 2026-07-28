import AbstractApiEntity from '@wexample/js-api/Common/AbstractApiEntity';
import schema from '{{DATA_DIR}}/{{ENTITY_NAME}}.json';

export default class {{CLASS_NAME}} extends AbstractApiEntity {
  static readonly entityName = '{{CAMEL_NAME}}';

  static retrieveEntitySchema() {
    return schema;
  }
}
