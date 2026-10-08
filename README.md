# @wexample/js-api

Version: 8.0.4

`@wexample/js-api` is a generic TypeScript client for any JSON API: `AbstractApiClient` wraps `ky` with a base URL, a bearer token, default headers and a `beforeError` hook that maps HTTP failures to `ApiHttpError`, which says whether retrying may help (`isTransient()`). Its `ApiClientOptions` carry the transport policy shared with php-api's `ClientOptions` and the Python `wexample_api` gateway — timeout, retries of idempotent requests, a minimum delay between requests — and `checkConnection()` answers health checks.

It knows nothing about the remote's payloads. Front-ends consuming APIs served by `wexample/symfony-api` — envelope, entity schemas, repositories, Mercure live updates — build on `@wexample/js-api-entity`, which extends this package. The Vue form helpers (`AbstractFormMixin`, `VueFormController`) ship here too, published as raw `.ts` sources under `./*` exports rather than a compiled bundle.

```ts
class ExampleClient extends AbstractApiClient {
  static pingPath = 'health';
}

const client = ExampleClient.create({ baseUrl: 'https://api.example.com', timeout: 30, retries: 2 });
await client.checkConnection(); // boolean, never throws
```

## Table of Contents

- [Architecture](#architecture)
- [Integration in the Suite](#integration-in-the-suite)
- [Dependencies](#dependencies)
- [Versioning & Compatibility Policy](#versioning--compatibility-policy)
- [License](#license)
- [About us](#about-us)
- [Migration Notes](#migration-notes)

## Architecture

The package ships a generic client for any JSON API and the Vue form helpers built on it, as raw TypeScript under src: src/Common holds the client and its errors, src/Helper pure functions, src/Vue Vue mixins. Nothing is compiled — `package.json` maps `"./*"` to `"./src/*.ts"` for both `types` and `default`, so consumers import raw TypeScript (`import AbstractApiClient from '@wexample/js-api/Common/AbstractApiClient'`) and bundle it themselves. `npm run build` is `tsc --noEmit`: a type check, not a compilation.

The entity layer — entities, schemas, repositories, the `{type, code, data}` envelope, live updates and the code generators — moved to `@wexample/js-api-entity`, whose `AbstractApiEntitiesClient` extends `AbstractApiClient`. Nothing in this package knows the shape of a response body.

### The client

`AbstractApiClient` (src/Common/AbstractApiClient.ts) is a `ky` wrapper and owns everything HTTP. It builds two instances from the same hooks and options: `this.client`, created with `prefixUrl: this.baseUrl.replace(/\/+$/, '')` when a base URL was given, and `this.absoluteClient` for full URLs — hence the `get`/`getAbsolute`, `post`/`postAbsolute`, `delete`/`deleteAbsolute` pairs.

Two hooks carry the behaviour. `beforeRequest` waits for the rate limit, then re-applies `this.defaultHeaders` and `Authorization: Bearer …` on every request, which is why `setBearerToken()` and `setDefaultHeader()` take effect without rebuilding the client. `beforeError` converts a `ky` `HTTPError` into `ApiHttpError.fromResponse(...)`, then asks `shouldCaptureError()` whether to report it: a per-request `options.context` may carry `captureError: false` or an `onError` callback returning `false`, which suppresses the client-wide `onError` reporter while still returning the mapped error to the caller. That is the escape hatch form submissions use for expected 422-style validation responses.

### Transport options

`ApiClientOptions` mirrors php-api's `ClientOptions` and the Python `wexample_api` gateway; every duration is in seconds:

- `timeout` is handed to `ky` (in milliseconds); left undefined, `ky`'s own 10 seconds apply, `false` waits indefinitely;
- `retries` and `retryDelay` configure `ky`'s retry for idempotent methods only (`get`, `put`, `head`, `delete`, `options`, `trace`) — a retried POST or PATCH could apply twice — with the delay doubled at each attempt. The decision is made by `retry.shouldRetry` on the mapped `ApiHttpError` (`isTransient()`), because `beforeError` has already replaced `ky`'s `HTTPError` by the time `ky` decides; network failures are retried, timeouts are not;
- `rateLimitDelay` spaces requests of one client; `waitForRateLimit()` books a slot per request, so concurrent requests are queued one delay apart rather than sent together.

Defaults — no retry, no pacing — keep the historical behaviour. `checkConnection()` requests the static `pingPath` (empty by default: the base URL) with error capture disabled and answers a boolean.

### Errors

All errors extend `AbstractAppError` (src/Common/Errors/AbstractAppError.ts), which adds `kind`, `code`, `severity` and a `context` record on top of `Error`, plus `toLogPayload()` running values through `serializeForLog`. This package defines `api.http`: `ApiHttpError`, severity `error` at 5xx and `warning` below, with `isTransient()` true for any 5xx, 408, 425 and 429. `apiErrorIsTransient()` (src/Helper/ApiError.ts) extends the question to any caught value: a transient `ApiHttpError`, a network failure (`fetch` rejects with a `TypeError`) or a `ky` timeout. `@wexample/js-api-entity` adds the `api.envelope`, `api.schema` and `api.live-updates` kinds.

### The Vue layer

The mixins in src/Vue are plain option objects, composed by `mixins: [...]`. `WithAsyncComponentLoadVueMixin` owns the `asyncComponentLoaded`/`loading`/`sleeping`/`error` state machine and the `loadAsyncComponent()` promise deduplication. The entity mixins built on these — collection, single entity, entity forms — live in `@wexample/js-api-entity`.

Forms are split between a controller and a mixin. `VueFormController` implements `FormControllerInterface` and holds the registered `FieldControllerInterface` instances, disabling them all on `beginSubmit()`; it is `provide`d by `AbstractFormMixin` so fields can inject it. The mixin itself handles the submit round-trip: it posts through the API client when one is available and falls back to native `fetch` otherwise, and it routes validation responses — envelopes with `type === 'error'` carrying a `data.summary` — into `formErrors` and `fieldErrors` instead of letting them bubble, using the `context.onError` escape hatch of `AbstractApiClient` so those responses are not reported as errors. `AbstractGraphMixin` is unrelated to the API layer: a `ResizeObserver` publishing `graphWidth`/`graphHeight`.

## Integration in the Suite

This package is part of the Wexample Suite — a collection of high-quality, modular tools designed to work seamlessly together across multiple languages and environments.

### Related Packages

The suite includes packages for configuration management, file handling, prompts, and more. Each package can be used independently or as part of the integrated suite.

Visit the [Wexample Suite documentation](https://docs.wexample.com) for the complete package ecosystem.

## Dependencies

- @wexample/js-helpers: >=4.0.0
- ky: ^1.4.0

## Versioning & Compatibility Policy

Wexample packages follow **Semantic Versioning** (SemVer):

- **MAJOR**: Breaking changes
- **MINOR**: New features, backward compatible
- **PATCH**: Bug fixes, backward compatible

We maintain backward compatibility within major versions and provide clear migration guides for breaking changes.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

Free to use in both personal and commercial projects.

## About us

[Wexample](https://wexample.com) stands as a cornerstone of the digital ecosystem — a collective of seasoned engineers, researchers, and creators driven by a relentless pursuit of technological excellence. More than a media platform, it has grown into a vibrant community where innovation meets craftsmanship, and where every line of code reflects a commitment to clarity, durability, and shared intelligence.

This packages suite embodies this spirit. Trusted by professionals and enthusiasts alike, it delivers a consistent, high-quality foundation for modern development — open, elegant, and battle-tested. Its reputation is built on years of collaboration, refinement, and rigorous attention to detail, making it a natural choice for those who demand both robustness and beauty in their tools.

Wexample cultivates a culture of mastery. Each package, each contribution carries the mark of a community that values precision, ethics, and innovation — a community proud to shape the future of digital craftsmanship.

## Migration Notes

When upgrading between major versions, refer to the migration guides in the documentation.

Breaking changes are clearly documented with upgrade paths and examples.
