import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { RevenueTreasury__factory } from "../../../../typechain";
import { getDeployer } from "../../../../utils/deployer-helper";
import { getConfig } from "../../../entities/config";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const config = getConfig();
  /*
  ░██╗░░░░░░░██╗░█████╗░██████╗░███╗░░██╗██╗███╗░░██╗░██████╗░
  ░██║░░██╗░░██║██╔══██╗██╔══██╗████╗░██║██║████╗░██║██╔════╝░
  ░╚██╗████╗██╔╝███████║██████╔╝██╔██╗██║██║██╔██╗██║██║░░██╗░
  ░░████╔═████║░██╔══██║██╔══██╗██║╚████║██║██║╚████║██║░░╚██╗
  ░░╚██╔╝░╚██╔╝░██║░░██║██║░░██║██║░╚███║██║██║░╚███║╚██████╔╝
  ░░░╚═╝░░░╚═╝░░╚═╝░░╚═╝╚═╝░░╚═╝╚═╝░░╚══╝╚═╝╚═╝░░╚══╝░╚═════╝░
  Check all variables below before execute the deployment script
  */

  const MIN_VAULT_OUT = 0;
  const MIN_GRASSHOUSE_OUT = 0;

  const deployer = await getDeployer();
  const revenueTreasury = RevenueTreasury__factory.connect(config.RevenueTreasury!, deployer);

  const feedGrassHouseTx = await revenueTreasury.feedGrassHouse(MIN_VAULT_OUT, MIN_GRASSHOUSE_OUT);

  console.log(`> ✅ Done feedGrassHouse at tx: ${feedGrassHouseTx.hash}`);
};

export default func;
func.tags = ["RevenueTreasuryFeedGrassHouse"];
