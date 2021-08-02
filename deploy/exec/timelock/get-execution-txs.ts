import { TimelockEntity } from "../../entities";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import TimelockTransactions from "../../results/1627882495_pcs-worker02-turn-on-new-partial-close-strats.json";
import { FileService, TimelockService } from "../../services";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  for (const timelockTransaction of TimelockTransactions) {
    console.log(`// ${timelockTransaction.info}`);
    console.log(timelockTransaction.executionTransaction);
    console.log("\n");
  }
};

export default func;
func.tags = ["GetExecutionTxs"];
