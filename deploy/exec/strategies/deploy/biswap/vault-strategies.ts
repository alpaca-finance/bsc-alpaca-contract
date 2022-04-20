import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { ethers, upgrades } from "hardhat";
import { BiswapStrategyAddTwoSidesOptimal, BiswapStrategyAddTwoSidesOptimal__factory } from "../../../../../typechain";
import { getConfig } from "../../../../entities/config";
import { getDeployer } from "../../../../../utils/deployer-helper";
import { validateAddress } from "../../../../../utils/address";
import { fileService } from "../../../../services";

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
      VAULT_SYMBOL: "ibWBNB",
      WHITELIST_WORKERS: [],
    },
    {
      VAULT_SYMBOL: "ibUSDT",
      WHITELIST_WORKERS: [],
    },
  ];

  const config = getConfig();
  const deployer = await getDeployer();

  for (let i = 0; i < NEW_PARAMS.length; i++) {
    const targetedVaultIdx = config.Vaults.findIndex((v) => v.symbol === NEW_PARAMS[i].VAULT_SYMBOL);
    if (targetedVaultIdx === -1) {
      throw `error: not found vault based on ${NEW_PARAMS[i].VAULT_SYMBOL}`;
    }

    const targetedVault = config.Vaults[targetedVaultIdx];
    if (!validateAddress(targetedVault.address)) {
      throw `error: no address`;
    }

    console.log(">> Deploying an upgradable BiswapStrategyAddTwoSidesOptimal contract");
    const BiswapStrategyAddTwoSidesOptimal = (await ethers.getContractFactory(
      "BiswapStrategyAddTwoSidesOptimal",
      deployer
    )) as BiswapStrategyAddTwoSidesOptimal__factory;
    const strategyAddTwoSidesOptimal = (await upgrades.deployProxy(BiswapStrategyAddTwoSidesOptimal, [
      config.YieldSources.Biswap!.BiswapRouterV2,
      targetedVault.address,
    ])) as BiswapStrategyAddTwoSidesOptimal;
    const deployedTx = await strategyAddTwoSidesOptimal.deployTransaction.wait(3);
    console.log(`>> Deployed at ${strategyAddTwoSidesOptimal.address}`);
    console.log(`>> Deployed block: ${deployedTx.blockNumber}`);
    console.log("✅ Done");

    console.log(">> Updating json config file");
    config.Vaults[targetedVaultIdx].StrategyAddTwoSidesOptimal.Biswap = strategyAddTwoSidesOptimal.address;
    fileService.writeConfigJson(config);
    console.log(`>> Updated StrategyAddTwoSidesOptimal.Biswap for Vault ${targetedVault.name}`);
    console.log("✅ Done");

    if (NEW_PARAMS[i].WHITELIST_WORKERS.length > 0) {
      console.log(">> Whitelisting Workers");
      const tx = await strategyAddTwoSidesOptimal.setWorkersOk(NEW_PARAMS[i].WHITELIST_WORKERS, true);
      console.log("✅ Done at: ", tx.hash);
    }
  }
};

export default func;
func.tags = ["BiswapVaultStrategies"];
