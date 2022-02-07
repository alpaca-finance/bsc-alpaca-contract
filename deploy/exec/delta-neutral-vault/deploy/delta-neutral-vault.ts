import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { ethers, upgrades } from "hardhat";
import { DeltaNeutralVault, DeltaNeutralVault__factory } from "../../../../typechain";
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
  interface IDeltaNeutralVaultInput {
    name: string;
    symbol: string;
    stableVaultSymbol: string;
    assetVaultSymbol: string;
    stableDeltaWorker: string;
    assetDeltaWorker: string;
    lpName: string;
  }

  const deltaVaultInputs: IDeltaNeutralVaultInput[] = [
    {
      name: "DeltaNeutralVault ETH-USDT",
      symbol: "ETH-USDT",
      stableVaultSymbol: "ibUSDT",
      assetVaultSymbol: "ibETH",
      stableDeltaWorker: "0x17f153C5576cF48Bd19dC50dDEcF30F4adCd97C9",
      assetDeltaWorker: "0x50adF479Cf1A917326392e9192037Cb9570A92a9",
      lpName: "ETH-USDT LP",
    },
  ];
  const PRICE_HELPER_ADDR = "";
  const DELTA_VAULT_CONFIG_ADDR = "";

  const deployer = (await ethers.getSigners())[0];
  const config = ConfigEntity.getConfig();
  const alpacaTokenAddress = config.Tokens.ALPACA;
  for (let i = 0; i < deltaVaultInputs.length; i++) {
    const stableVault = config.Vaults.find((v) => v.symbol === deltaVaultInputs[i].stableVaultSymbol);
    const assetVault = config.Vaults.find((v) => v.symbol === deltaVaultInputs[i].assetVaultSymbol);
    const lpPair = config.Exchanges.Mdex.LpTokens.find((lp) => lp.name === deltaVaultInputs[i].lpName);
    if (stableVault === undefined) {
      throw `error: unable to find vault from ${deltaVaultInputs[i].stableVaultSymbol}`;
    }
    if (assetVault === undefined) {
      throw `error: unable to find vault from ${deltaVaultInputs[i].assetVaultSymbol}`;
    }
    if (lpPair === undefined) {
      throw `error: unable to find LP token from ${deltaVaultInputs[i].lpName}`;
    }
    const DeltaNeutralVault = (await ethers.getContractFactory(
      "DeltaNeutralVault",
      deployer
    )) as DeltaNeutralVault__factory;

    console.log("===================================================================================");
    console.log(`>> Deploying a DeltaNeutralVault ${deltaVaultInputs[i].name}`);
    const deltaNeutralVault = (await upgrades.deployProxy(DeltaNeutralVault, [
      deltaVaultInputs[i].name,
      deltaVaultInputs[i].symbol,
      stableVault.address,
      assetVault.address,
      deltaVaultInputs[i].stableDeltaWorker,
      deltaVaultInputs[i].assetDeltaWorker,
      lpPair.address,
      alpacaTokenAddress,
      PRICE_HELPER_ADDR,
      DELTA_VAULT_CONFIG_ADDR,
    ])) as DeltaNeutralVault;
    await deltaNeutralVault.deployed();
    console.log(`>> Deployed at ${deltaNeutralVault.address}`);
  }
};

export default func;
func.tags = ["DeltaNeutralVault"];
