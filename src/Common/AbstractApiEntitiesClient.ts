import AbstractApiClient, { type ApiClientOptions } from './AbstractApiClient';

export default abstract class AbstractApiEntitiesClient extends AbstractApiClient {
  protected constructor(options: ApiClientOptions = {}) {
    super(options);
  }
}
