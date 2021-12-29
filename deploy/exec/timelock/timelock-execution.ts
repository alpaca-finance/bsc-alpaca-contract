import { TimelockEntity } from "../../entities";
import { ethers } from "hardhat";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import TimelockTransactions from "../../results/1639971134_mainnet-xALPACA-set-reinvest-config.json";
import { FileService, TimelockService } from "../../services";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const deployer = (await ethers.getSigners())[0];
  const timelockTransactions: Array<TimelockEntity.Transaction> = [];
  const errs = [];
  let nonce = await deployer.getTransactionCount();

  for (const timelockTransaction of TimelockTransactions) {
    try {
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
          timelockTransaction.eta,
          { nonce }
        )
      );
      nonce++;
    } catch (error) {
      console.log(">> error while executing transaction: ", timelockTransaction.info);
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
