import AbstractEntityManipulatorMixin from './AbstractEntityManipulatorMixin.js';
import WithAsyncComponentLoadVueMixin from './WithAsyncComponentLoadVueMixin.js';

const AbstractEntitySingleMixin = {
  mixins: [AbstractEntityManipulatorMixin, WithAsyncComponentLoadVueMixin],
  emits: ['entity-deleted'],

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
      this.validateEntitySource();
      this.entity = newEntity ?? null;
    },

    async entitySecureId(newSecureId, oldSecureId) {
      this.validateEntitySource();

      if (this.entityInstance || !newSecureId || newSecureId === oldSecureId) {
        return;
      }

      await this.loadAsyncComponent(true);
    }
  },

  methods: {
    validateEntitySource() {
      const hasEntityInstance = this.entityInstance !== null && this.entityInstance !== undefined;
      const hasEntitySecureId =
        this.entitySecureId !== null && this.entitySecureId !== undefined && this.entitySecureId !== '';

      if (hasEntityInstance === hasEntitySecureId) {
        throw new Error('Provide exactly one of entityInstance or entitySecureId.');
      }
    },

    async fetchEntity() {
      const secureId = this.getEntitySecureId();

      this.entityLoading = true;
      try {
        this.entity = await this.getEntityRepository().fetch({
          identifier: secureId,
        });
        return this.entity;
      } finally {
        this.entityLoading = false;
      }
    },

    getEntitySecureId() {
      const secureIdFromEntity = this.entity?.secureId ?? this.entityInstance?.secureId;
      const secureId = secureIdFromEntity ?? this.entitySecureId;

      if (secureId === null || secureId === undefined || secureId === '') {
        throw new Error('Missing entity secureId.');
      }

      return String(secureId);
    },

    async asyncComponentLoad() {
      this.validateEntitySource();

      if (this.entityInstance) {
        this.entity = this.entityInstance;
        return;
      }

      await this.fetchEntity();
    },

    async deleteCurrentEntity() {
      const secureId = this.getEntitySecureId();
      const deletedEntity = this.entity;

      await this.getEntityRepository().deleteEntity({
        identifier: secureId,
      });

      this.entity = null;
      this.$emit('entity-deleted', {
        entity: deletedEntity,
        identifier: secureId,
      });
    },
  },
};

export default AbstractEntitySingleMixin;
