import { TimelockEntity } from "../../entities";
import { ethers } from "hardhat";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { FileService, TimelockService } from "../../services";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const deployer = (await ethers.getSigners())[0];
  const timelockTransactions: Array<TimelockEntity.Transaction> = [];
  const queuedTimelockPath = "./deploy/results/1647581640_mainnet_8x_delta_neutral_set_whitelisted_callers.json";
  const queuedTimelocks = (await FileService.readJson(queuedTimelockPath)) as Array<TimelockEntity.Transaction>;
  const errs = [];
  let nonce = await deployer.getTransactionCount();

  for (const queuedTimelock of queuedTimelocks) {
    try {
      timelockTransactions.push(
        await TimelockService.executeTransaction(
          queuedTimelock.info,
          queuedTimelock.queuedAt,
          queuedTimelock.executionTransaction,
          queuedTimelock.target,
          queuedTimelock.value,
          queuedTimelock.signature,
          queuedTimelock.paramTypes,
          queuedTimelock.params,
          queuedTimelock.eta,
          { nonce: nonce++ }
        )
      );
    } catch (error) {
      console.log(">> error while executing transaction: ", queuedTimelock.info);
      errs.push(error);
    }
  }

  console.log("> Writing time execution results");
  FileService.write("timelock-execution", timelockTransactions);

  if (errs.length > 0) {
    console.log("> Writing errors");
    FileService.write("timelock-execution-errors", errs);
  }
};

export default func;
func.tags = ["TimeLockExecution"];
