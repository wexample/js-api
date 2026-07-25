import { VueFormController } from './VueFormController';

type SetFormErrorsOptions = {
  formErrors?: string[];
  fieldErrors?: Record<string, string[]>;
};

type SubmitFormActionOptions = {
  asyncAction: () => Promise<unknown>;
};

type ApiSubmitRequestOptions = {
  endpoint: string;
  method?: string;
  payload?: unknown;
};

type ApiClientRequestOptions = {
  path: string;
  options?: {
    context?: {
      captureError?: boolean;
      onError?: (options: { error: unknown }) => boolean | Promise<boolean>;
    };
  } & Record<string, unknown>;
};

type ApiClientLike = {
  get: (options: ApiClientRequestOptions) => { json: <T>() => Promise<T> };
  post: (options: ApiClientRequestOptions) => { json: <T>() => Promise<T> };
  delete: (options: ApiClientRequestOptions) => { json: <T>() => Promise<T> };
};

type ApiValidationSummary = {
  global?: string[];
  fields?: Record<string, string[]>;
};

type ApiValidationResponse = {
  type?: string;
  data?: {
    summary?: ApiValidationSummary;
  };
};

type ApiErrorWithJsonResponse = {
  response?: {
    json?: <T>() => Promise<T>;
  };
  payload?: unknown;
};

const AbstractFormMixin = {
  provide() {
    return {
      formController: (this as any).formController,
    };
  },

  data() {
    return {
      formController: new VueFormController(),
      formIsSubmitting: false,
      formErrors: [],
      fieldErrors: {},
      submitEndpoint: null as string | null,
    };
  },

  methods: {
    getSubmitEndpoint(): string | null {
      return (this as any).submitEndpoint;
    },

    getSubmitMethod(): string {
      return 'POST';
    },

    buildSubmitPayload(): unknown {
      return {};
    },

    async requestApiSubmit(options: ApiSubmitRequestOptions) {
      const { endpoint, method = 'POST', payload = {} } = options;
      const resolvedMethod = String(method || 'POST').toUpperCase();

      let apiClient: ApiClientLike | null = null;
      try {
        const apiService = (this as any).app.getService('api') as any;
        if (typeof apiService.getClient === 'function') {
          apiClient = apiService.getClient() as ApiClientLike;
        }
      } catch {
        // API service not registered or client not configured — fall back to native fetch
      }

      if (apiClient) {
        const requestContext = {
          onError: async (context: { error: unknown }) =>
            (this as any).shouldCaptureApiSubmitError(context.error),
        };

        if (resolvedMethod === 'GET') {
          return apiClient
            .get({ path: endpoint, options: { context: requestContext } })
            .json<unknown>();
        }

        if (resolvedMethod === 'DELETE') {
          return apiClient
            .delete({
              path: endpoint,
              options:
                payload == null
                  ? { context: requestContext }
                  : { json: payload, context: requestContext },
            })
            .json<unknown>();
        }

        return apiClient
          .post({ path: endpoint, options: { json: payload ?? {}, context: requestContext } })
          .json<unknown>();
      }

      // Native fetch fallback when no API client is configured.
      const fetchInit: RequestInit = {
        method: resolvedMethod,
        headers: { 'Content-Type': 'application/json' },
      };
      if (resolvedMethod !== 'GET' && payload != null) {
        fetchInit.body = JSON.stringify(payload);
      }
      const response = await fetch(endpoint, fetchInit);
      return response.json();
    },

    onBeforeSubmit(): boolean {
      // Hook: return false to cancel submission.
      return true;
    },

    async onSubmit() {
      const endpoint = (this as any).getSubmitEndpoint();
      if (!endpoint) {
        throw new Error(
          'Missing submit endpoint. Override getSubmitEndpoint() or set submitEndpoint.'
        );
      }

      if (!(this as any).onBeforeSubmit()) {
        return;
      }

      return (this as any).submitFormAction({
        asyncAction: async () => {
          try {
            const response = await (this as any).requestApiSubmit({
              endpoint,
              method: (this as any).getSubmitMethod(),
              payload: (this as any).buildSubmitPayload(),
            });

            if (!(this as any).handleApiValidationResponse(response)) {
              (this as any).onApiSubmitSuccess(response);
            }
            return response;
          } catch (error) {
            const errorResponse = await (this as any).extractApiErrorResponse(error);
            if (errorResponse && (this as any).handleApiValidationResponse(errorResponse)) {
              return errorResponse;
            }

            throw error;
          }
        },
      });
    },

    clearFormErrors() {
      (this as any).formErrors = [];
      (this as any).fieldErrors = {};
    },

    setFormErrors(options: SetFormErrorsOptions = {}) {
      const { formErrors = [], fieldErrors = {} } = options;

      (this as any).formErrors = Array.isArray(formErrors) ? formErrors : [];
      (this as any).fieldErrors = fieldErrors && typeof fieldErrors === 'object' ? fieldErrors : {};
    },

    getFieldErrors(fieldPath: string): string[] {
      return (this as any).fieldErrors[fieldPath] || [];
    },

    applyApiValidationSummary(summary?: ApiValidationSummary): void {
      const safeSummary = summary && typeof summary === 'object' ? summary : {};
      (this as any).setFormErrors({
        formErrors: Array.isArray(safeSummary.global) ? safeSummary.global : [],
        fieldErrors:
          safeSummary.fields && typeof safeSummary.fields === 'object' ? safeSummary.fields : {},
      });
    },

    applyApiValidationFromResponse(response: unknown): void {
      const safeResponse =
        response && typeof response === 'object'
          ? (response as { data?: { summary?: ApiValidationSummary } })
          : {};
      const summary = safeResponse?.data?.summary;

      (this as any).applyApiValidationSummary(summary);
    },

    async extractApiErrorResponse(error: unknown): Promise<unknown | null> {
      const safeError =
        error && typeof error === 'object' ? (error as ApiErrorWithJsonResponse) : {};
      const errorResponse = safeError.response;

      if (!errorResponse || typeof errorResponse.json !== 'function') {
        const payload = safeError.payload;
        return payload && typeof payload === 'object' ? payload : null;
      }

      try {
        return await errorResponse.json<unknown>();
      } catch {
        return null;
      }
    },

    responseHasValidationError(response: unknown): boolean {
      const safeResponse =
        response && typeof response === 'object' ? (response as ApiValidationResponse) : {};

      if (safeResponse?.type !== 'error') {
        return false;
      }

      const summary = safeResponse?.data?.summary;
      return !!(summary && typeof summary === 'object');
    },

    async shouldCaptureApiSubmitError(error: unknown): Promise<boolean> {
      const errorResponse = await (this as any).extractApiErrorResponse(error);

      if (!errorResponse) {
        return true;
      }

      return !(this as any).responseHasValidationError(errorResponse);
    },

    handleApiValidationResponse(response: unknown): boolean {
      if (!(this as any).responseHasValidationError(response)) {
        (this as any).clearFormErrors();
        return false;
      }

      (this as any).applyApiValidationFromResponse(response);
      return true;
    },

    async submitFormAction(options: SubmitFormActionOptions) {
      const { asyncAction } = options;
      const controller: VueFormController = (this as any).formController;

      (this as any).formIsSubmitting = true;
      controller.beginSubmit();
      (this as any).clearFormErrors();

      try {
        return await asyncAction();
      } catch (error) {
        (this as any).handleSubmitError(error);
        throw error;
      } finally {
        (this as any).formIsSubmitting = false;
        controller.endSubmit();
      }
    },

    handleSubmitError(_error: unknown): void {
      // Hook for child mixins/components.
    },

    onApiSubmitSuccess(_response: unknown): void {
      // Hook for child mixins/components.
    },
  },
};

export default AbstractFormMixin;
