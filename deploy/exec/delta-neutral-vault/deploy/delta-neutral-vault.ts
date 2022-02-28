import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { ethers, upgrades } from "hardhat";
import { DeltaNeutralVault, DeltaNeutralVault__factory, WNativeRelayer__factory } from "../../../../typechain";
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
    lpAddress: string;
    deltaNeutralVaultConfig: string;
  }

  const deltaVaultInputs: IDeltaNeutralVaultInput[] = [
    {
      name: "Neutral3x WBNB-BUSD Pancakeswap",
      symbol: "N3-WBNB-BUSD-PCS",
      stableVaultSymbol: "ibBUSD",
      assetVaultSymbol: "ibWBNB",
      stableSymbol: "BUSD",
      assetSymbol: "WBNB",
      stableDeltaWorker: "0xf3aa816e28c38875d77A505563FDfaBdBFE4c939", // Address of stable deltaneutral worker
      assetDeltaWorker: "0xd3fea79f499dd91E3D9A628aaF803E3f0f1e3290", // Address of asset deltaneutral worker
      lpAddress: "0x8918A1B7d90B2d33eA89784a8405896430Dd0Ba9",
      deltaNeutralVaultConfig: "0x98ECC385Ea749Cb55874769cb38391A8299EB592",
    },
  ];

  const config = ConfigEntity.getConfig();
  const deployer = (await ethers.getSigners())[0];
  const alpacaTokenAddress = config.Tokens.ALPACA;
  const wNativeRelayerAddr = config.SharedConfig.WNativeRelayer;
  for (let i = 0; i < deltaVaultInputs.length; i++) {
    const stableVault = config.Vaults.find((v) => v.symbol === deltaVaultInputs[i].stableVaultSymbol);
    const assetVault = config.Vaults.find((v) => v.symbol === deltaVaultInputs[i].assetVaultSymbol);
    if (stableVault === undefined) {
      throw `error: unable to find vault from ${deltaVaultInputs[i].stableVaultSymbol}`;
    }
    if (assetVault === undefined) {
      throw `error: unable to find vault from ${deltaVaultInputs[i].assetVaultSymbol}`;
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
      deltaVaultInputs[i].lpAddress,
      alpacaTokenAddress,
      config.Oracle.DeltaNeutralOracle!,
      deltaVaultInputs[i].deltaNeutralVaultConfig,
    ])) as DeltaNeutralVault;
    const deployTxReceipt = await deltaNeutralVault.deployTransaction.wait(3);
    console.log(`>> Deployed at ${deltaNeutralVault.address}`);
    console.log(`>> Deployed block: ${deployTxReceipt.blockNumber}`);
    console.log("✅ Done");

    if (deltaVaultInputs[i].assetVaultSymbol === "ibWBNB") {
      console.log(`>> Set Caller ok for deltaNeutralVault if have native asset`);
      const wNativeRelayer = WNativeRelayer__factory.connect(wNativeRelayerAddr, deployer);
      await (await wNativeRelayer.setCallerOk([deltaNeutralVault.address], true)).wait(3);
      console.log("✅ Done");
    }
  }
};

export default func;
func.tags = ["DeltaNeutralVault"];
