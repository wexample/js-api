`@wexample/js-api` is a generic TypeScript client for any JSON API: `AbstractApiClient` wraps `ky` with a base URL, a bearer token, default headers and a `beforeError` hook that maps HTTP failures to `ApiHttpError`, which says whether retrying may help (`isTransient()`). Its `ApiClientOptions` carry the transport policy shared with php-api's `ClientOptions` and the Python `wexample_api` gateway — timeout, retries of idempotent requests, a minimum delay between requests — and `checkConnection()` answers health checks.

It knows nothing about the remote's payloads. Front-ends consuming APIs served by `wexample/symfony-api` — envelope, entity schemas, repositories, Mercure live updates — build on `@wexample/js-api-entity`, which extends this package. The Vue form helpers (`AbstractFormMixin`, `VueFormController`) ship here too, published as raw `.ts` sources under `./*` exports rather than a compiled bundle.

```ts
class ExampleClient extends AbstractApiClient {
  static pingPath = 'health';
}

const client = ExampleClient.create({ baseUrl: 'https://api.example.com', timeout: 30, retries: 2 });
await client.checkConnection(); // boolean, never throws
```
