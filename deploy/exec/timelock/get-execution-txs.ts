import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import TimelockTransactions from "../../results/1627366428_update-19-reserve-pool-bps.json";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  for (const timelockTransaction of TimelockTransactions) {
    console.log(`// ${timelockTransaction.info}`);
    console.log(timelockTransaction.executionTransaction);
    console.log("\n");
  }
};

export default func;
func.tags = ["GetExecutionTxs"];
