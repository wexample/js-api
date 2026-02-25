const WithAsyncComponentLoadVueMixin = {
  data() {
    return {
      asyncComponentLoaded: false,
      asyncComponentLoading: true,
      asyncComponentError: null,
      asyncComponentLoadPromise: null,
    };
  },

  async mounted() {
    await this.loadAsyncComponent(true);
  },

  methods: {
    async asyncComponentLoad() {
      // Override in component to load required async data.
    },

    asyncComponentPromisesLoad() {
      // Override in component to return additional async work.
      // Each item can be a Promise or a function returning a Promise.
      return [];
    },

    resolveAsyncComponentPromises() {
      const items = this.asyncComponentPromisesLoad();
      if (!Array.isArray(items) || !items.length) {
        return [];
      }

      return items.map((item) => {
        if (typeof item === 'function') {
          return item.call(this);
        }

        return item;
      });
    },

    async duringAsyncLoad(asyncCallback) {
      this.asyncComponentLoading = true;
      this.asyncComponentError = null;

      try {
        const result = await asyncCallback.call(this);
        this.asyncComponentLoaded = true;
        return result;
      } catch (error) {
        this.asyncComponentLoaded = false;
        this.asyncComponentError = error;
        throw error;
      } finally {
        this.asyncComponentLoading = false;
      }
    },

    async loadAsyncComponent(forceRefresh = false) {
      if (this.asyncComponentLoading && !forceRefresh) {
        return this.asyncComponentLoadPromise;
      }

      if (this.asyncComponentLoaded && !forceRefresh) {
        return;
      }

      this.asyncComponentLoadPromise = (async () => {
        try {
          return await this.duringAsyncLoad(async () => {
            const extraPromises = this.resolveAsyncComponentPromises();
            await Promise.all([
              this.asyncComponentLoad(),
              ...extraPromises,
            ]);
          });
        } finally {
          this.asyncComponentLoadPromise = null;
        }
      })();

      return this.asyncComponentLoadPromise;
    },

    resetAsyncComponentState() {
      this.asyncComponentLoaded = false;
      this.asyncComponentLoading = true;
      this.asyncComponentError = null;
      this.asyncComponentLoadPromise = null;
    },
  },
};

export default WithAsyncComponentLoadVueMixin;
