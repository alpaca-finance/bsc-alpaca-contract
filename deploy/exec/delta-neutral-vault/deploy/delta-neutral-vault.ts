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
      name: "Market Neutral 3x BNB-BUSD PCS1",
      symbol: "n3x-BNBBUSD-PCS1",
      stableVaultSymbol: "ibBUSD",
      assetVaultSymbol: "ibWBNB",
      stableSymbol: "BUSD",
      assetSymbol: "WBNB",
      lpAddress: "0x58F876857a02D6762E0101bb5C46A8c1ED44Dc16",
      deltaNeutralVaultConfig: "0x5640ce665c4fAc707885A04059449DadAbe56Cf2",
      stableDeltaWorker: "0x54D3218787060463EEb944fa01b0cbE745Ef4DB5",
      assetDeltaWorker: "0x07767daF4e84bDAaBf3A72c80cec8C8Eb962f3Ae",
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
