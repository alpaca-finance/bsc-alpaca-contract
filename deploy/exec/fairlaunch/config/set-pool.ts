import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { ethers, network } from "hardhat";
import { Timelock__factory } from "../../../../typechain";
import MainnetConfig from "../../../../.mainnet.json";
import TestnetConfig from "../../../../.testnet.json";

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
  const UPDATES: Array<IUpdate> = [
    {
      STAKING_TOKEN: "fdALPACA",
      ALLOC_POINT: 300,
    },
    {
      STAKING_TOKEN: "ibALPACA",
      ALLOC_POINT: 0,
    },
  ];
  const EXACT_ETA = "1640242800";

  const config = network.name === "mainnet" ? MainnetConfig : TestnetConfig;
  const inputs: Array<IInput> = [];

  /// @dev derived input
  for (let i = 0; i < UPDATES.length; i++) {
    const pool = config.FairLaunch.pools.find((p) => p.stakingToken == UPDATES[i].STAKING_TOKEN);
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

  const timelock = Timelock__factory.connect(config.Timelock, (await ethers.getSigners())[0]);

  for (const input of inputs) {
    console.log(`>> Timelock: Set pool for ${input.stakingPool} via Timelock`);
    await timelock.queueTransaction(
      config.Shield,
      "0",
      "setPool(uint256,uint256,bool)",
      ethers.utils.defaultAbiCoder.encode(["uint256", "uint256", "bool"], [input.pId, input.allocPoint, true]),
      EXACT_ETA
    );
    console.log("generate timelock.executeTransaction:");
    console.log(
      `await timelock.executeTransaction('${config.Shield}', '0', 'setPool(uint256,uint256,bool)', ethers.utils.defaultAbiCoder.encode(['uint256','uint256','bool'],[${input.pId}, ${input.allocPoint}, true]), ${EXACT_ETA})`
    );
    console.log("✅ Done");
  }
};

export default func;
func.tags = ["TimelockSetPool"];
