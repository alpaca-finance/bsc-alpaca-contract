import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { ethers, upgrades, network } from "hardhat";
import {
  MdexRestrictedStrategyAddTwoSidesOptimal,
  MdexRestrictedStrategyAddTwoSidesOptimal__factory,
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
      VAULT_SYMBOL: "ibWBNB",
      WHITELIST_WORKER: [],
    },
    {
      VAULT_SYMBOL: "ibBUSD",
      WHITELIST_WORKER: [],
    },
    {
      VAULT_SYMBOL: "ibETH",
      WHITELIST_WORKER: [],
    },
    {
      VAULT_SYMBOL: "ibALPACA",
      WHITELIST_WORKER: [],
    },
    {
      VAULT_SYMBOL: "ibUSDT",
      WHITELIST_WORKER: [],
    },
    {
      VAULT_SYMBOL: "ibBTCB",
      WHITELIST_WORKER: [],
    },
    {
      VAULT_SYMBOL: "ibTUSD",
      WHITELIST_WORKER: [],
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

    console.log(
      `>> Deploying an upgradable Restricted StrategyAddTwoSidesOptimalV2 contract for ${targetedVault.symbol}`
    );
    const MdexRestrictedStrategyAddTwoSidesOptimal = (await ethers.getContractFactory(
      "MdexRestrictedStrategyAddTwoSidesOptimal",
      (
        await ethers.getSigners()
      )[0]
    )) as MdexRestrictedStrategyAddTwoSidesOptimal__factory;
    const strategyRestrictedAddTwoSidesOptimal = (await upgrades.deployProxy(MdexRestrictedStrategyAddTwoSidesOptimal, [
      config.Exchanges.Mdex.MdexRouter,
      targetedVault.address,
      config.Tokens.MDX,
    ])) as MdexRestrictedStrategyAddTwoSidesOptimal;
    await strategyRestrictedAddTwoSidesOptimal.deployed();
    console.log(`>> Deployed at ${strategyRestrictedAddTwoSidesOptimal.address}`);

    if (NEW_PARAMS[i].WHITELIST_WORKER.length > 0) {
      console.log(">> Whitelisting Workers");
      const tx = await strategyRestrictedAddTwoSidesOptimal.setWorkersOk(NEW_PARAMS[i].WHITELIST_WORKER, true);
      console.log(">> Done at: ", tx.hash);
    }
  }
};

export default func;
func.tags = ["MdexVaultRestrictedStrategies"];
