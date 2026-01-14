import type AbstractApiEntitiesClient from "../Common/AbstractApiEntitiesClient";
import type AbstractApiEntity from "../Common/AbstractApiEntity";
import type { ApiEntityConstructor } from "../Common/AbstractApiEntity";
import type AbstractApiRepository from "../Common/AbstractApiRepository";
import type ApiEntityManager from "../Common/ApiEntityManager";

type ApiClientHolder = {
  $apiClient: AbstractApiEntitiesClient;
};

type EntityManipulatorThis = ApiClientHolder & {
  getEntityClass(): ApiEntityConstructor<AbstractApiEntity>;
};

const AbstractEntityManipulatorMixin = {
  methods: {
    getEntityClass(): ApiEntityConstructor<AbstractApiEntity> {
      throw new Error("getEntityClass() must be implemented.");
    },

    getEntityManager(this: ApiClientHolder): ApiEntityManager {
      return this.$apiClient.getEntityManager();
    },

    getEntityRepository(
      this: EntityManipulatorThis,
      entityType?: ApiEntityConstructor<AbstractApiEntity>,
    ): AbstractApiRepository<AbstractApiEntity> {
      const entityClass = entityType ?? this.getEntityClass();
      return this.$apiClient.getRepository(entityClass);
    },
  },
};

export default AbstractEntityManipulatorMixin;
