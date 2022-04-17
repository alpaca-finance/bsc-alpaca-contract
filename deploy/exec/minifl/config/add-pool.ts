import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { ethers, network } from "hardhat";
import { MiniFL__factory, Timelock, Timelock__factory } from "../../../../typechain";
import { getConfig } from "../../../entities/config";
import { TimelockEntity } from "../../../entities";
import { fileService, TimelockService } from "../../../services";

interface IAddPool {
  STAKING_TOKEN_ADDRESS: string;
  ALLOC_POINT: number;
  REWARDER_ADDRESS: string;
  IS_DEBT_TOKEN: boolean;
  WITH_UPDATE: boolean;
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
  const POOLS: Array<IAddPool> = [
    {
      STAKING_TOKEN_ADDRESS: "0xA3451cfC2f630Fc2DD8230f33Dd925c2063d2737",
      ALLOC_POINT: 0,
      REWARDER_ADDRESS: "0x7EEAA96bf1aBaA206615046c0991E678a2b12Da1",
      IS_DEBT_TOKEN: false,
      WITH_UPDATE: true,
    },
  ];
  const EXACT_ETA = "1639738800";

  const config = getConfig();
  const [deployer] = await ethers.getSigners();
  const miniFL = MiniFL__factory.connect(config.MiniFL!.address, deployer);
  const timelockTransactions: Array<TimelockEntity.Transaction> = [];
  const isTimelocked = (await miniFL.owner()).toLowerCase() === config.Timelock.toLowerCase();

  for (const pool of POOLS) {
    if (isTimelocked) {
      timelockTransactions.push(
        await TimelockService.queueTransaction(
          `>> Timelock: Add ${pool.STAKING_TOKEN_ADDRESS} with ${pool.ALLOC_POINT} via Timelock`,
          config.MiniFL!.address,
          "0",
          "addPool(uint256,address,address,bool,bool)",
          ["uint256", "address", "address", "bool", "bool"],
          [pool.ALLOC_POINT, pool.STAKING_TOKEN_ADDRESS, pool.REWARDER_ADDRESS, pool.IS_DEBT_TOKEN, pool.WITH_UPDATE],
          EXACT_ETA
        )
      );
    } else {
      console.log(`>> Add ${pool.STAKING_TOKEN_ADDRESS} with ${pool.ALLOC_POINT} point`);
      await miniFL.addPool(
        pool.ALLOC_POINT,
        pool.STAKING_TOKEN_ADDRESS,
        pool.REWARDER_ADDRESS,
        pool.IS_DEBT_TOKEN,
        pool.WITH_UPDATE
      );
      console.log(">> Done");
    }
  }

  if (isTimelocked) fileService.writeJson("add-pool", timelockTransactions);
};

export default func;
func.tags = ["MiniFLAddPool"];
