import { MiniFL__factory } from "../../../../typechain/factories/MiniFL__factory";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { getConfig } from "../../../entities/config";
import { getDeployer } from "../../../../utils/deployer-helper";

interface IUpdate {
  STAKING_TOKEN: string;
  ALLOC_POINT: number;
  OVERWRITE: boolean;
  WITH_UPDATE: boolean;
}

interface IInput {
  pId: number;
  stakingPool: string;
  allocPoint: number;
  rewarder: string;
  overwrite: boolean;
  withUpdate: boolean;
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
      STAKING_TOKEN: "ibTOMB",
      ALLOC_POINT: 0,
      OVERWRITE: false,
      WITH_UPDATE: true,
    },
    {
      STAKING_TOKEN: "debtIbTOMB_V2",
      ALLOC_POINT: 0,
      OVERWRITE: false,
      WITH_UPDATE: true,
    },
  ];

  const config = getConfig();
  const deployer = await getDeployer();
  const inputs: Array<IInput> = [];
  const miniFL = MiniFL__factory.connect(config.MiniFL!.address, deployer);
  let nonce = await deployer.getTransactionCount();

  /// @dev derived input
  for (let i = 0; i < UPDATES.length; i++) {
    const pool = config.MiniFL!.pools.find((p) => p.stakingToken == UPDATES[i].STAKING_TOKEN);
    if (pool !== undefined) {
      inputs.push({
        pId: pool.id,
        stakingPool: pool.stakingToken,
        allocPoint: UPDATES[i].ALLOC_POINT,
        rewarder: pool.rewarder,
        overwrite: UPDATES[i].OVERWRITE,
        withUpdate: UPDATES[i].WITH_UPDATE,
      });
    } else {
      throw new Error(`not found ${UPDATES[i].STAKING_TOKEN}`);
    }
  }

  for (const input of inputs) {
    console.log(`>> MiniFL: set ${input.stakingPool} with ${input.allocPoint}`);
    await miniFL.setPool(input.pId, input.allocPoint, input.rewarder, input.overwrite, input.withUpdate, {
      nonce: nonce++,
    });
  }
};

export default func;
func.tags = ["MiniFLSetPool"];
