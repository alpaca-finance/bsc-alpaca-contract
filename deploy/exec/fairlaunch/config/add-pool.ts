import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { ethers, network } from "hardhat";
import { Timelock__factory } from "../../../../typechain";
import MainnetConfig from "../../../../.mainnet.json";
import TestnetConfig from "../../../../.testnet.json";

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
  const POOLS: Array<IAddPool> = [
    {
      STAKING_TOKEN_ADDRESS: "0x877264983807D568Cf0B61344cB03012c1F11B17",
      ALLOC_POINT: 0,
    },
  ];
  const EXACT_ETA = "1639112400";

  const config = network.name === "mainnet" ? MainnetConfig : TestnetConfig;

  const timelock = Timelock__factory.connect(config.Timelock, (await ethers.getSigners())[0]);

  for (const pool of POOLS) {
    console.log(`>> Timelock: Add ${pool.STAKING_TOKEN_ADDRESS} with ${pool.ALLOC_POINT} via Timelock`);
    await timelock.queueTransaction(
      config.Shield,
      "0",
      "addPool(uint256,address,bool)",
      ethers.utils.defaultAbiCoder.encode(
        ["uint256", "address", "bool"],
        [pool.ALLOC_POINT, pool.STAKING_TOKEN_ADDRESS, true]
      ),
      EXACT_ETA
    );
    console.log("generate timelock.executeTransaction:");
    console.log(
      `await timelock.executeTransaction('${config.Shield}', '0', 'addPool(uint256,address,bool)', ethers.utils.defaultAbiCoder.encode(['uint256','address','bool'],[${pool.ALLOC_POINT}, '${pool.STAKING_TOKEN_ADDRESS}', true]), ${EXACT_ETA})`
    );
    console.log("✅ Done");
  }
};

export default func;
func.tags = ["TimelockAddPool"];
