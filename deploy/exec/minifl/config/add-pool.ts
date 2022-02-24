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
      STAKING_TOKEN_ADDRESS: "0x50E5748a2E9C5e05Ba8b95549Bf7B11dA91ddAB7",
      ALLOC_POINT: 0,
      REWARDER_ADDRESS: "0x0000000000000000000000000000000000000000",
      IS_DEBT_TOKEN: false,
    },
  ];
  const EXACT_ETA = "1639738800";

  const config = getConfig();

  const timelock = Timelock__factory.connect(config.Timelock, (await ethers.getSigners())[0]);

  for (const pool of POOLS) {
    console.log(`>> Timelock: Add ${pool.STAKING_TOKEN_ADDRESS} with ${pool.ALLOC_POINT} via Timelock`);
    await timelock.queueTransaction(
      config.MiniFL!.address,
      "0",
      "addPool(uint256,address,address,bool)",
      ethers.utils.defaultAbiCoder.encode(
        ["uint256", "address", "address", "bool"],
        [pool.ALLOC_POINT, pool.STAKING_TOKEN_ADDRESS, pool.REWARDER_ADDRESS, pool.IS_DEBT_TOKEN]
      ),
      EXACT_ETA
    );
    console.log("generate timelock.executeTransaction:");
    console.log(
      `await timelock.executeTransaction('${
        config.MiniFL!.address
      }', '0', 'addPool(uint256,address,address,bool)', ethers.utils.defaultAbiCoder.encode(['uint256','address','bool'],[${
        pool.ALLOC_POINT
      }, '${pool.STAKING_TOKEN_ADDRESS}', '${pool.REWARDER_ADDRESS}', '${pool.IS_DEBT_TOKEN}']), ${EXACT_ETA})`
    );
    console.log("✅ Done");
  }
};

export default func;
func.tags = ["TimelockMiniFLAddPool"];
