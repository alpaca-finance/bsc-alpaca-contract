import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { ethers, network, upgrades } from "hardhat";
import { DeltaNeutralVaultConfig, DeltaNeutralVaultConfig__factory } from "../../../../typechain";
import { ConfigEntity } from "../../../entities";

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
  const REBALANCE_FACTOR = "6600";
  const POSITION_VALUE_TOLERANCE_BPS = "100";
  const TREASURY_ADDR = "";
  const ALPACA_BOUNTY_BPS = "100";

  const config = ConfigEntity.getConfig();
  const deployer = (await ethers.getSigners())[0];
  const WRAP_NATIVE_ADDR = config.Tokens.WBNB;
  const WNATIVE_RELAYER = config.SharedConfig.WNativeRelayer;
  const FAIR_LAUNCH_ADDR = config.FairLaunch.address;

  console.log(">> Deploying an upgradable DeltaNeutralVaultConfig contract");
  const alpacaTokenAddress = config.Tokens.ALPACA;
  const DeltaNeutralVaultConfig = (await ethers.getContractFactory(
    "DeltaNeutralVaultConfig",
    deployer
  )) as DeltaNeutralVaultConfig__factory;
  const deltaNeutralVaultConfig = (await upgrades.deployProxy(DeltaNeutralVaultConfig, [
    WRAP_NATIVE_ADDR,
    WNATIVE_RELAYER,
    FAIR_LAUNCH_ADDR,
    REBALANCE_FACTOR,
    POSITION_VALUE_TOLERANCE_BPS,
    TREASURY_ADDR,
    ALPACA_BOUNTY_BPS,
    alpacaTokenAddress,
  ])) as DeltaNeutralVaultConfig;
  await deltaNeutralVaultConfig.deployed();
  console.log(`>> Deployed at ${deltaNeutralVaultConfig.address}`);
  console.log("✅ Done");
};

export default func;
func.tags = ["DeltaNeutralVaultConfig"];
