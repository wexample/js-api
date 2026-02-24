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
      this.validateEntitySource();
      this.entity = newEntity ?? null;
    },

    async entitySecureId(newSecureId, oldSecureId) {
      this.validateEntitySource();

      if (this.entityInstance || !newSecureId || newSecureId === oldSecureId) {
        return;
      }

      await this.fetchEntity();
    },
  },

  async mounted() {
    this.validateEntitySource();

    if (this.entitySecureId) {
      await this.fetchEntity();
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
      if (!this.entitySecureId) {
        throw new Error('Missing entitySecureId.');
      }

      this.entityLoading = true;
      try {
        this.entity = await this.getEntityRepository().fetch({
          identifier: String(this.entitySecureId),
        });
        return this.entity;
      } finally {
        this.entityLoading = false;
      }
    },
  },
};

export default AbstractEntitySingleMixin;
