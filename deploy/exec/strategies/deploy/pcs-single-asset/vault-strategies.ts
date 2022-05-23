import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { ethers, upgrades, network } from "hardhat";
import {
  PancakeswapV2RestrictedSingleAssetStrategyAddBaseWithFarm,
  PancakeswapV2RestrictedSingleAssetStrategyAddBaseWithFarm__factory,
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
      VAULT_SYMBOL: "ibCAKE",
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

    console.log(">> Deploying an upgradable RestrictedSingleAssetStrategyAddTwoSidesOptimalV2 contract");
    const PancakeswapV2RestrictedSingleAssetStrategyAddBaseWithFarm = (await ethers.getContractFactory(
      "PancakeswapV2RestrictedSingleAssetStrategyAddBaseWithFarm",
      (
        await ethers.getSigners()
      )[0]
    )) as PancakeswapV2RestrictedSingleAssetStrategyAddBaseWithFarm__factory;

    const singleAssetStrategyRestrictedAddBaseWithFarm = (await upgrades.deployProxy(
      PancakeswapV2RestrictedSingleAssetStrategyAddBaseWithFarm,
      [config.YieldSources.Pancakeswap!.RouterV2, targetedVault.address]
    )) as PancakeswapV2RestrictedSingleAssetStrategyAddBaseWithFarm;

    await singleAssetStrategyRestrictedAddBaseWithFarm.deployed();
    console.log(`>> Deployed at ${singleAssetStrategyRestrictedAddBaseWithFarm.address}`);

    if (NEW_PARAMS[i].WHITELIST_WORKERS.length > 0) {
      console.log(">> Whitelisting Workers");
      const tx = await singleAssetStrategyRestrictedAddBaseWithFarm.setWorkersOk(NEW_PARAMS[i].WHITELIST_WORKERS, true);
      console.log(">> Done at: ", tx.hash);
    }
  }
};

export default func;
func.tags = ["RestrictedSingleAssetVaultStrategiesV2"];
