import { SpookySwapDnxStrategyAddTwoSidesOptimal } from "./../../../../../typechain";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
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
      VAULT_SYMBOL: "ibFTM",
      WHITELIST_WORKERS: ["0x792E8192F2fbdBb5c1e36F312760Fe01D0d7aB92", "0x0e807E2F50dfe8616636083Ba5ecef97280338cf"],
    },
    {
      VAULT_SYMBOL: "ibUSDC",
      WHITELIST_WORKERS: ["0xceCD803b048b66a75bc64f8AA8139cAB97c421C8", "0xBF94404D6ad9986532d25950585e5855b4c30d2c"],
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

    const stratDnxTwoSidesOptimalDeployer = new UpgradeableContractDeployer<SpookySwapDnxStrategyAddTwoSidesOptimal>(
      deployer,
      "SpookySwapDnxStrategyAddTwoSidesOptimal",
      NEW_PARAMS[i].VAULT_SYMBOL
    );
    const { contract: strategyDnxAddTwoSidesOptimal } = await stratDnxTwoSidesOptimalDeployer.deploy([
      config.YieldSources.SpookySwap!.SpookyRouter,
      targetedVault.address,
    ]);

    config = configFileHelper.setVaultTwosideOptimalOnKey(
      targetedVault.name,
      "SpookySwapDnx",
      strategyDnxAddTwoSidesOptimal.address
    );

    if (NEW_PARAMS[i].WHITELIST_WORKERS.length > 0) {
      console.log(">> Whitelisting Workers");
      const tx = await strategyDnxAddTwoSidesOptimal.setWorkersOk(NEW_PARAMS[i].WHITELIST_WORKERS, true);
      console.log("✅ Done at: ", tx.hash);

      for (let j = 0; j < NEW_PARAMS[i].WHITELIST_WORKERS.length; j++) {
        const targetWorkerIdx = targetedVault.workers.findIndex(
          (w) => w.address === NEW_PARAMS[i].WHITELIST_WORKERS[j]
        );
        if (targetWorkerIdx === -1) {
          throw `error: not found worker based on ${NEW_PARAMS[i].WHITELIST_WORKERS[j]}`;
        }
        const targetedWorker = targetedVault.workers[targetWorkerIdx];
        targetedWorker.strategies.StrategyAddTwoSidesOptimal = strategyDnxAddTwoSidesOptimal.address;
        configFileHelper.addOrSetVaultWorker(targetedVault.name, targetedWorker);
      }
    }
  }
};

export default func;
func.tags = ["SpookySwapDnxVaultStrategies"];
