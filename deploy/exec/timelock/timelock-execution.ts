import { TimelockEntity } from "../../entities";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import TimelockTransactions from "../../results/mock.json";
import { FileService, TimelockService } from "../../services";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const timelockTransactions: Array<TimelockEntity.Transaction> = [];
  try {
    for (const timelockTransaction of TimelockTransactions) {
      timelockTransactions.push(
        await TimelockService.executeTransaction(
          timelockTransaction.info,
          timelockTransaction.queuedAt,
          timelockTransaction.executionTransaction,
          timelockTransaction.target,
          timelockTransaction.value,
          timelockTransaction.signature,
          timelockTransaction.paramTypes,
          timelockTransaction.params,
          timelockTransaction.eta
        )
      );
    }
  } catch (e) {
    console.log(e);
  }

  FileService.write("timelock-execution", timelockTransactions);
};

export default func;
func.tags = ["TimeLockExecution"];
