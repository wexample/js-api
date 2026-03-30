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
  data() {
    return {
      formIsSubmitting: false,
      formErrors: [],
      fieldErrors: {},
      submitEndpoint: null as string | null,
    };
  },

  methods: {
    getSubmitEndpoint(): string | null {
      return this.submitEndpoint;
    },

    getSubmitMethod(): string {
      return 'POST';
    },

    buildSubmitPayload(): unknown {
      return {};
    },

    async requestApiSubmit(options: ApiSubmitRequestOptions) {
      const { endpoint, method = 'POST', payload = {} } = options;
      const apiClient = this.app.getClient() as ApiClientLike;
      const resolvedMethod = String(method || 'POST').toUpperCase();
      const requestContext = {
        onError: async (context: { error: unknown }) =>
          this.shouldCaptureApiSubmitError(context.error),
      };

      if (resolvedMethod === 'GET') {
        return apiClient
          .get({
            path: endpoint,
            options: {
              context: requestContext,
            },
          })
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
        .post({
          path: endpoint,
          options: {
            json: payload ?? {},
            context: requestContext,
          },
        })
        .json<unknown>();
    },

    async onSubmit() {
      const endpoint = this.getSubmitEndpoint();
      if (!endpoint) {
        throw new Error(
          'Missing submit endpoint. Override getSubmitEndpoint() or set submitEndpoint.'
        );
      }

      return this.submitFormAction({
        asyncAction: async () => {
          try {
            const response = await this.requestApiSubmit({
              endpoint,
              method: this.getSubmitMethod(),
              payload: this.buildSubmitPayload(),
            });

            this.handleApiValidationResponse(response);
            return response;
          } catch (error) {
            const errorResponse = await this.extractApiErrorResponse(error);
            if (errorResponse && this.handleApiValidationResponse(errorResponse)) {
              return errorResponse;
            }

            throw error;
          }
        },
      });
    },

    clearFormErrors() {
      this.formErrors = [];
      this.fieldErrors = {};
    },

    setFormErrors(options: SetFormErrorsOptions = {}) {
      const { formErrors = [], fieldErrors = {} } = options;

      this.formErrors = Array.isArray(formErrors) ? formErrors : [];
      this.fieldErrors = fieldErrors && typeof fieldErrors === 'object' ? fieldErrors : {};
    },

    getFieldErrors(fieldPath: string): string[] {
      return this.fieldErrors[fieldPath] || [];
    },

    applyApiValidationSummary(summary?: ApiValidationSummary): void {
      const safeSummary = summary && typeof summary === 'object' ? summary : {};
      this.setFormErrors({
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

      this.applyApiValidationSummary(summary);
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
      const errorResponse = await this.extractApiErrorResponse(error);

      if (!errorResponse) {
        return true;
      }

      return !this.responseHasValidationError(errorResponse);
    },

    handleApiValidationResponse(response: unknown): boolean {
      if (!this.responseHasValidationError(response)) {
        this.clearFormErrors();
        return false;
      }

      this.applyApiValidationFromResponse(response);
      return true;
    },

    async submitFormAction(options: SubmitFormActionOptions) {
      const { asyncAction } = options;

      this.formIsSubmitting = true;
      this.clearFormErrors();

      try {
        return await asyncAction();
      } catch (error) {
        this.handleSubmitError(error);
        throw error;
      } finally {
        this.formIsSubmitting = false;
      }
    },

    handleSubmitError(_error: unknown): void {
      // Hook for child mixins/components.
    },
  },
};

export default AbstractFormMixin;
