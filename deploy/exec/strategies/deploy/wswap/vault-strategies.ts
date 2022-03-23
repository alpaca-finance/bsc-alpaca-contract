import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { ethers, upgrades, network } from "hardhat";
import {
  WaultSwapRestrictedStrategyAddTwoSidesOptimal,
  WaultSwapRestrictedStrategyAddTwoSidesOptimal__factory,
} from "../../../../../typechain";
import { ConfigEntity } from "../../../../entities";

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
      VAULT_SYMBOL: "ibTUSD",
      WHITELIST_WORKERS: [],
    },
  ];

  const config = ConfigEntity.getConfig();

  for (let i = 0; i < NEW_PARAMS.length; i++) {
    const targetedVault = config.Vaults.find((v) => v.symbol === NEW_PARAMS[i].VAULT_SYMBOL);
    if (targetedVault === undefined) {
      throw `error: not found vault based on ${NEW_PARAMS[i].VAULT_SYMBOL}`;
    }
    if (targetedVault.address === "") {
      throw `error: no address`;
    }

    console.log(">> Deploying an upgradable Restricted StrategyAddTwoSidesOptimalV2 contract");
    const StrategyRestrictedAddTwoSidesOptimal = (await ethers.getContractFactory(
      "WaultSwapRestrictedStrategyAddTwoSidesOptimal",
      (
        await ethers.getSigners()
      )[0]
    )) as WaultSwapRestrictedStrategyAddTwoSidesOptimal__factory;
    const strategyRestrictedAddTwoSidesOptimal = (await upgrades.deployProxy(StrategyRestrictedAddTwoSidesOptimal, [
      config.YieldSources.Waultswap!.WaultswapRouter,
      targetedVault.address,
    ])) as WaultSwapRestrictedStrategyAddTwoSidesOptimal;
    await strategyRestrictedAddTwoSidesOptimal.deployed();
    console.log(`>> Deployed at ${strategyRestrictedAddTwoSidesOptimal.address}`);

    if (NEW_PARAMS[i].WHITELIST_WORKERS.length > 0) {
      console.log(">> Whitelisting Workers");
      const tx = await strategyRestrictedAddTwoSidesOptimal.setWorkersOk(NEW_PARAMS[i].WHITELIST_WORKERS, true);
      console.log(">> Done at: ", tx.hash);
    }
  }
};

export default func;
func.tags = ["WaultSwapRestrictedVaultStrategies"];
