import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { ethers } from "hardhat";
import { getConfig } from "../../../entities/config";
import { TimelockEntity } from "../../../entities";
import { fileService, TimelockService } from "../../../services";

interface IUpdate {
  STAKING_TOKEN: string;
  ALLOC_POINT: number;
}

interface IInput {
  pId: number;
  stakingPool: string;
  allocPoint: number;
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
  const TITLE = "set_CAKE_Vault_alloc";
  const UPDATES: Array<IUpdate> = [
    {
      STAKING_TOKEN: "debtIbCAKE V2",
      ALLOC_POINT: 25,
    },
    {
      STAKING_TOKEN: "ibCAKE",
      ALLOC_POINT: 50,
    },
  ];
  const EXACT_ETA = "1654146000";

  const config = getConfig();
  const inputs: Array<IInput> = [];

  /// @dev derived input
  for (let i = 0; i < UPDATES.length; i++) {
    const pool = config.FairLaunch!.pools.find((p) => p.stakingToken == UPDATES[i].STAKING_TOKEN);
    if (pool !== undefined) {
      inputs.push({
        pId: pool.id,
        stakingPool: pool.stakingToken,
        allocPoint: UPDATES[i].ALLOC_POINT,
      });
    } else {
      throw new Error(`not found ${UPDATES[i].STAKING_TOKEN}`);
    }
  }

  const deployer = (await ethers.getSigners())[0];
  const timelockTransactions: Array<TimelockEntity.Transaction> = [];
  let nonce = await deployer.getTransactionCount();

  for (const input of inputs) {
    timelockTransactions.push(
      await TimelockService.queueTransaction(
        `>> Timelock: Set pool for ${input.stakingPool} via Timelock`,
        config.Shield!,
        "0",
        "setPool(uint256,uint256,bool)",
        ["uint256", "uint256", "bool"],
        [input.pId, input.allocPoint, true],
        EXACT_ETA,
        { nonce: nonce++ }
      )
    );
  }

  const ts = Math.floor(Date.now() / 1000);
  fileService.writeJson(`${ts}_${TITLE}`, timelockTransactions);
};

export default func;
func.tags = ["TimelockSetPool"];
