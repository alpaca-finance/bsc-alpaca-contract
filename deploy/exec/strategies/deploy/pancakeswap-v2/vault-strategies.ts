import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { ethers, upgrades, network } from "hardhat";
import {
  PancakeswapV2RestrictedStrategyAddTwoSidesOptimal,
  PancakeswapV2RestrictedStrategyAddTwoSidesOptimal__factory,
} from "../../../../../typechain";
import MainnetConfig from "../../../../../.mainnet.json";
import TestnetConfig from "../../../../../.testnet.json";

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
      VAULT_SYMBOL: "ibUSDC",
      WHITELIST_WORKERS: [],
    },
  ];

  const config = network.name === "mainnet" ? MainnetConfig : TestnetConfig;

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
      "PancakeswapV2RestrictedStrategyAddTwoSidesOptimal",
      (
        await ethers.getSigners()
      )[0]
    )) as PancakeswapV2RestrictedStrategyAddTwoSidesOptimal__factory;
    const strategyRestrictedAddTwoSidesOptimal = (await upgrades.deployProxy(StrategyRestrictedAddTwoSidesOptimal, [
      config.YieldSources.Pancakeswap.RouterV2,
      targetedVault.address,
    ])) as PancakeswapV2RestrictedStrategyAddTwoSidesOptimal;
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
func.tags = ["RestrictedVaultStrategiesV2"];
