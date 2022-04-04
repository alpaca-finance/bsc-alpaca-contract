import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { ethers, upgrades } from "hardhat";
import { DeltaNeutralVault, DeltaNeutralVault__factory, WNativeRelayer__factory } from "../../../../typechain";
import { ConfigEntity } from "../../../entities";
import { getDeployer } from "../../../../utils/deployer-helper";

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

  const deltaVaultInputs: IDeltaNeutralVaultInput[] = [
    {
      name: "Market Neutral 3x FTM-USDC SPK1",
      symbol: "n3x-FTMUSDC-SPK1",
      stableVaultSymbol: "ibUSDC",
      assetVaultSymbol: "ibFTM",
      stableSymbol: "USDC",
      assetSymbol: "WFTM",
      stableDeltaWorker: "0xceCD803b048b66a75bc64f8AA8139cAB97c421C8", // Address of stable deltaneutral worker
      assetDeltaWorker: "0x792E8192F2fbdBb5c1e36F312760Fe01D0d7aB92", // Address of asset deltaneutral worker
      lpAddress: "0x2b4C76d0dc16BE1C31D4C1DC53bF9B45987Fc75c",
      deltaNeutralVaultConfig: "0x00166189cdBdB9E3a3391c458c08aa9834E592D5",
    },
  ];

  const config = ConfigEntity.getConfig();
  const deployer = await getDeployer();
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

    if (deltaVaultInputs[i].assetVaultSymbol === "ibWBNB" || deltaVaultInputs[i].assetVaultSymbol === "ibFTM") {
      console.log(`>> Set Caller ok for deltaNeutralVault if have native asset`);
      const wNativeRelayer = WNativeRelayer__factory.connect(wNativeRelayerAddr, deployer);
      await (await wNativeRelayer.setCallerOk([deltaNeutralVault.address], true)).wait(3);
      console.log("✅ Done");
    }
  }
};

export default func;
func.tags = ["DeltaNeutralVault"];
