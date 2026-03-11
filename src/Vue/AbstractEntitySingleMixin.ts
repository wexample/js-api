import type AbstractApiEntity from '../Common/AbstractApiEntity.js';
import { stringToCamelCase } from '@wexample/js-helpers/Helper/String';
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
      cachedRelationships: {} as Record<string, AbstractApiEntity[]>,
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
    resolveEntityCssTypeName() {
      try {
        const entityClass = this.getEntityClass?.();
        const rawTypeName = entityClass?.entityName ?? entityClass?.name;
        if (!rawTypeName || typeof rawTypeName !== 'string') {
          return null;
        }

        return rawTypeName.trim().toLowerCase().replace(/_/g, '-');
      } catch {
        return null;
      }
    },

    getEntityCssClassDeclarations() {
      const entityType = this.resolveEntityCssTypeName();
      const classes = [
        'entity',
        ['entity--single', true],
        ['entity--loaded', !!this.asyncComponentLoaded],
        ['entity--loading', !!this.asyncComponentLoading],
        ['entity--sleeping', !!this.asyncComponentSleeping],
        ['entity--error', !!this.asyncComponentError],
        ['entity--has-data', !!this.entity],
        ['entity--empty', !this.entity],
        ['entity--busy', !!this.entityLoading],
        ['entity--type--' + entityType, !!entityType],
      ];

      const display = this.getEntityDisplay();
      if (display) {
        classes.push('entity--display--' + display)
        classes.push('entity--' + entityType + '--display--' + display)
      }

      return classes;
    },

    getEntityDisplay() {
      return null;
    },

    getWrapperCssClassDeclarations() {
      return this.getEntityCssClassDeclarations();
    },

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

    getCachedRelationshipsMap(): Record<string, Promise<AbstractApiEntity[]> | null> | string[] {
      return {};
    },

    async _loadCachedRelationships(): Promise<void> {
      const map = this.getCachedRelationshipsMap();
      const entries: [string, Promise<AbstractApiEntity[]>][] = Array.isArray(map)
        ? map.map((name: string) => [
            stringToCamelCase(name),
            (this as any).getEntityRepository(name).fetchAllCached(),
          ])
        : Object.entries(map).map(([name, promise]) => [
            stringToCamelCase(name),
            promise ?? (this as any).getEntityRepository(name).fetchAllCached(),
          ]);

      if (!entries.length) return;

      await Promise.all(
        entries.map(async ([key, promise]) => {
          this.cachedRelationships[key] = await promise;
        })
      );
    },

    getCachedRelationship(name: string): AbstractApiEntity | null {
      const camelName = stringToCamelCase(name);
      const secureId = (this as any).entity.data[camelName];
      return this.cachedRelationships[camelName]?.find((e: AbstractApiEntity) => e.secureId === secureId) ?? null;
    },

    async asyncComponentLoad() {
      this.validateEntitySource();

      if (this.entityInstance) {
        this.entity = this.entityInstance;
        await this._loadCachedRelationships();
        return;
      }

      await Promise.all([this.fetchEntity(), this._loadCachedRelationships()]);
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
