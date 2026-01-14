import { createEntityManipulator } from "../Common/AbstractEntityManipulator";
import type { EntityManipulator } from "../Common/AbstractEntityManipulator";
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

    getEntityManipulator(this: EntityManipulatorThis): EntityManipulator<AbstractApiEntity> {
      return createEntityManipulator(this.$apiClient, () => this.getEntityClass());
    },

    getEntityManager(this: ApiClientHolder): ApiEntityManager {
      return this.getEntityManipulator().getEntityManager();
    },

    getEntityRepository(
      this: EntityManipulatorThis,
      entityType?: ApiEntityConstructor<AbstractApiEntity>,
    ): AbstractApiRepository<AbstractApiEntity> {
      return this.getEntityManipulator().getEntityRepository(entityType);
    },
  },
};

export default AbstractEntityManipulatorMixin;
