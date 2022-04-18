import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { ethers, upgrades } from "hardhat";
import {
  SpookySwapStrategyAddTwoSidesOptimal,
  SpookySwapStrategyAddTwoSidesOptimal__factory,
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
      VAULT_SYMBOL: "ibTOMB",
      WHITELIST_WORKERS: [],
    },
  ];

  const config = ConfigEntity.getConfig();
  const deployer = (await ethers.getSigners())[0];

  for (let i = 0; i < NEW_PARAMS.length; i++) {
    const targetedVault = config.Vaults.find((v) => v.symbol === NEW_PARAMS[i].VAULT_SYMBOL);
    if (targetedVault === undefined) {
      throw `error: not found vault based on ${NEW_PARAMS[i].VAULT_SYMBOL}`;
    }
    if (targetedVault.address === "") {
      throw `error: no address`;
    }

    console.log(">> Deploying an upgradable Spooky - StrategyAddTwoSidesOptimal contract");
    const SpookySwapStrategyAddTwoSidesOptimal = (await ethers.getContractFactory(
      "SpookySwapStrategyAddTwoSidesOptimal",
      deployer
    )) as SpookySwapStrategyAddTwoSidesOptimal__factory;
    const strategyAddTwoSidesOptimal = (await upgrades.deployProxy(SpookySwapStrategyAddTwoSidesOptimal, [
      config.YieldSources.SpookySwap!.SpookyRouter,
      targetedVault.address,
    ])) as SpookySwapStrategyAddTwoSidesOptimal;
    await strategyAddTwoSidesOptimal.deployTransaction.wait(5);
    console.log(`>> Deployed at ${strategyAddTwoSidesOptimal.address}`);

    if (NEW_PARAMS[i].WHITELIST_WORKERS.length > 0) {
      console.log(">> Whitelisting Workers");
      const tx = await strategyAddTwoSidesOptimal.setWorkersOk(NEW_PARAMS[i].WHITELIST_WORKERS, true);
      await tx.wait(5);
      console.log(">> Done at: ", tx.hash);
    }
  }
};

export default func;
func.tags = ["SpookySwapRestrictedVaultStrategies"];
