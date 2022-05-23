import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { BiswapStrategyAddTwoSidesOptimal } from "../../../../../typechain";
import { getDeployer } from "../../../../../utils/deployer-helper";
import { validateAddress } from "../../../../../utils/address";
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
  const NEW_PARAMS = [
    {
      VAULT_SYMBOL: "ibCAKE",
      WHITELIST_WORKERS: [],
    },
  ];

  const deployer = await getDeployer();
  const configFileHelper = new ConfigFileHelper();
  let config = configFileHelper.getConfig();

  for (let i = 0; i < NEW_PARAMS.length; i++) {
    const targetedVaultIdx = config.Vaults.findIndex((v) => v.symbol === NEW_PARAMS[i].VAULT_SYMBOL);
    if (targetedVaultIdx === -1) {
      throw `error: not found vault based on ${NEW_PARAMS[i].VAULT_SYMBOL}`;
    }

    const targetedVault = config.Vaults[targetedVaultIdx];
    if (!validateAddress(targetedVault.address)) {
      throw `error: no address`;
    }

    const stratTwoSidesOptimalDeployer = new UpgradeableContractDeployer<BiswapStrategyAddTwoSidesOptimal>(
      deployer,
      "BiswapStrategyAddTwoSidesOptimal"
    );
    const { contract: strategyAddTwoSidesOptimal } = await stratTwoSidesOptimalDeployer.deploy([
      config.YieldSources.Biswap!.BiswapRouterV2,
      targetedVault.address,
    ]);

    config = configFileHelper.setVaultTwosideOptimalOnKey(
      targetedVault.name,
      "Biswap",
      strategyAddTwoSidesOptimal.address
    );

    if (NEW_PARAMS[i].WHITELIST_WORKERS.length > 0) {
      console.log(">> Whitelisting Workers");
      const tx = await strategyAddTwoSidesOptimal.setWorkersOk(NEW_PARAMS[i].WHITELIST_WORKERS, true);
      console.log("✅ Done at: ", tx.hash);
    }
  }
};

export default func;
func.tags = ["BiswapVaultStrategies"];
