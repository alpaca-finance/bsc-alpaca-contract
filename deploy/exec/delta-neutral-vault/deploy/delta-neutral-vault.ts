import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { ethers, upgrades } from "hardhat";
import { DeltaNeutralVault, DeltaNeutralVault__factory } from "../../../../typechain";
import { ConfigEntity } from "../../../entities";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";

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
    stableSymbol: string;
    assetSymbol: string;
    stableDeltaWorker: string;
    assetDeltaWorker: string;
    lpName: string;
    deltaNeutralVaultConfig: string;
  }

  const deltaVaultInputs: IDeltaNeutralVaultInput[] = [
    {
      name: "Neutral3x WBNB-BUSD MDEX",
      symbol: "N3-WBNB-BUSD-MDEX",
      stableVaultSymbol: "ibBUSD",
      assetVaultSymbol: "ibWBNB",
      stableSymbol: "BUSD",
      assetSymbol: "WBNB",
      stableDeltaWorker: "0xb2B70dD85Cd919B59deaF09B8Dcd58553c4bb465",
      assetDeltaWorker: "0x251388f3cC98541F91B1E425010f453CBe939fcd",
      lpName: "WBNB-BUSD LP",
      deltaNeutralVaultConfig: "0xf58e614C615bded1d22EdC9Dd8afD1fb7126c26d",
    },
  ];
  const DELTA_NEUTRAL_ORACLE_ADDR = "0x6F904F6c13EA3a80dD962f0150E49d943b7d1819";

  const config = ConfigEntity.getConfig();
  const deployer = (await ethers.getSigners())[0];
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
      DELTA_NEUTRAL_ORACLE_ADDR,
      deltaVaultInputs[i].deltaNeutralVaultConfig,
    ])) as DeltaNeutralVault;
    await deltaNeutralVault.deployed();
    console.log(`>> Deployed at ${deltaNeutralVault.address}`);
    console.log("✅ Done");
  }
};

export default func;
func.tags = ["DeltaNeutralVault"];
