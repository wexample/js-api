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
