import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { ethers } from "hardhat";
import { TimelockEntity } from "../../../entities";
import { fileService, TimelockService } from "../../../services";
import { getConfig } from "../../../entities/config";

interface IAddPool {
  STAKING_TOKEN_ADDRESS: string;
  ALLOC_POINT: number;
}

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  /*
  ░██╗░░░░░░░██╗░█████╗░██████╗░███╗░░██╗██╗███╗░░██╗░██████╗░
  ░██║░░██╗░░██║██╔══██╗██╔══██╗████╗░██║██║████╗░██║██╔════╝░
  ░╚██╗████╗██╔╝███████║██████╔╝██╔██╗██║██║██╔██╗██║██║░░██╗░
  ░░████╔═████║░██╔══██║██╔══██╗██║╚████║██║██║╚████║██║░░╚██╗
  ░░╚██╔╝░╚██╔╝░██║░░██║██║░░██║██║░╚███║██║██║░╚███║╚██████╔╝
  ░░░╚═╝░░░╚═╝░░╚═╝░░╚═╝╚═╝░░╚═╝╚═╝░░╚══╝╚═╝╚═╝░░╚══╝░╚═════╝░
  Check all variables below before execute the deployment script
  */
  const TITLE = "add-ftm-emission-pool";
  const POOLS: Array<IAddPool> = [
    {
      STAKING_TOKEN_ADDRESS: "0xC4Ed268754DD3CbCA82A6eE743ACAd2D355D938b",
      ALLOC_POINT: 0,
    },
  ];
  const EXACT_ETA = "1647064800";

  const config = getConfig();
  const deployer = (await ethers.getSigners())[0];
  const timelockTransactions: Array<TimelockEntity.Transaction> = [];
  let nonce = await deployer.getTransactionCount();

  for (const pool of POOLS) {
    timelockTransactions.push(
      await TimelockService.queueTransaction(
        `>> Timelock: Add ${pool.STAKING_TOKEN_ADDRESS} with ${pool.ALLOC_POINT} via Timelock`,
        config.Shield!,
        "0",
        "addPool(uint256,address,bool)",
        ["uint256", "address", "bool"],
        [pool.ALLOC_POINT, pool.STAKING_TOKEN_ADDRESS, true],
        EXACT_ETA,
        { nonce: nonce++ }
      )
    );
  }

  fileService.writeJson(TITLE, timelockTransactions);
};

export default func;
func.tags = ["TimelockAddPool"];
