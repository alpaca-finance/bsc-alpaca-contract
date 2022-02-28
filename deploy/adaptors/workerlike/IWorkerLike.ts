import { WorkersEntity } from "../../interfaces/config";

export interface IWorkerLike {
  validateConfig(
    vaultAddress: string,
    vaultToken: string,
    routerAddress: string,
    workerInfo: WorkersEntity
  ): Promise<void>;
}
