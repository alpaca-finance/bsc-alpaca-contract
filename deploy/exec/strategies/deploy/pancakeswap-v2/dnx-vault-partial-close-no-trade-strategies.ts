import { PancakeswapV2RestrictedDnxStrategyPartialCloseNoTrading } from "../../../../../typechain";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { getDeployer } from "../../../../../utils/deployer-helper";
import { UpgradeableContractDeployer } from "../../../../deployer";
import { ConfigFileHelper } from "../../../../helper";

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

  const deployer = await getDeployer();
  const configFileHelper = new ConfigFileHelper();
  let config = configFileHelper.getConfig();

  const stratDnxPartialCloseNoTradeDeployer =
    new UpgradeableContractDeployer<PancakeswapV2RestrictedDnxStrategyPartialCloseNoTrading>(
      deployer,
      "PancakeswapV2RestrictedDnxStrategyPartialCloseNoTrading"
    );
  const { contract: strategyDnxPartialCloseNoTrade } = await stratDnxPartialCloseNoTradeDeployer.deploy([
    config.YieldSources.PancakeswapMasterChefV2!.RouterV2,
  ]);

  config = configFileHelper.setSharedStrategyOnKey(
    "Pancakeswap",
    "StrategyPartialCloseNoTrade",
    strategyDnxPartialCloseNoTrade.address
  );
};

export default func;
func.tags = ["PancakeswapDnxVaultStrategiesPartialCloseNoTrade"];
