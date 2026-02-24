import AbstractEntityManipulatorMixin from './AbstractEntityManipulatorMixin.js';

const AbstractEntitySingleMixin = {
  mixins: [AbstractEntityManipulatorMixin],

  props: {
    entityInstance: {
      type: Object,
      required: false,
      default: null,
    },
    entitySecureId: {
      type: [String, Number],
      required: false,
      default: null,
    },
  },

  data() {
    return {
      entity: this.entityInstance ?? null,
      entityLoading: false,
    };
  },

  watch: {
    entityInstance(newEntity) {
      this.entity = newEntity ?? null;
    },

    async entitySecureId(newSecureId, oldSecureId) {
      if (!newSecureId || newSecureId === oldSecureId) {
        return;
      }

      await this.fetchEntity({
        identifier: String(newSecureId),
      });
    },
  },

  async mounted() {
    if (!this.entity && this.entitySecureId) {
      await this.fetchEntity();
    }
  },

  methods: {
    getEntityFetchParams() {
      if (!this.entitySecureId) {
        throw new Error('Missing entitySecureId.');
      }

      return {
        identifier: String(this.entitySecureId),
      };
    },

    async fetchEntity(options) {
      this.entityLoading = true;
      try {
        const fetchOptions = options ?? this.getEntityFetchParams();
        this.entity = await this.getEntityRepository().fetch(fetchOptions);
        return this.entity;
      } finally {
        this.entityLoading = false;
      }
    },

    async refreshEntity() {
      return this.fetchEntity();
    },

    setEntity(entity) {
      this.entity = entity ?? null;
      return this.entity;
    },

    emitEntityUpdated(impact = 'default') {
      this.$emit('entity-updated', { entity: this.entity, impact });
    },

    emitEntityDeleted() {
      this.$emit('entity-deleted', { entity: this.entity });
    },
  },
};

export default AbstractEntitySingleMixin;
