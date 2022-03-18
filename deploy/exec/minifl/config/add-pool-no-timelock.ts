import { MiniFL__factory } from "./../../../../typechain/factories/MiniFL__factory";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { ethers, network } from "hardhat";
import { Timelock__factory } from "../../../../typechain";
import { getConfig } from "../../../entities/config";

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
      STAKING_TOKEN_ADDRESS: "",
      ALLOC_POINT: 0,
      REWARDER_ADDRESS: "0x0000000000000000000000000000000000000000",
      IS_DEBT_TOKEN: false,
      WITH_UPDATE: true,
    },
  ];

  const config = getConfig();
  const deployer = (await ethers.getSigners())[0];
  const miniFL = MiniFL__factory.connect(config.MiniFL!.address, deployer);
  let nonce = await deployer.getTransactionCount();

  for (const pool of POOLS) {
    console.log(`>> MiniFL: Add ${pool.STAKING_TOKEN_ADDRESS} with ${pool.ALLOC_POINT}`);
    await miniFL.addPool(
      pool.ALLOC_POINT,
      pool.STAKING_TOKEN_ADDRESS,
      pool.REWARDER_ADDRESS,
      pool.IS_DEBT_TOKEN,
      pool.WITH_UPDATE,
      {
        nonce: nonce++,
        gasPrice: ethers.utils.parseUnits("10", "gwei"),
      }
    );
    console.log("✅ Done");
  }
};

export default func;
func.tags = ["MiniFLAddPool"];
