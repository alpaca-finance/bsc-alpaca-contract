import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { ethers, upgrades } from "hardhat";
import { DeltaNeutralVault, DeltaNeutralVault__factory, WNativeRelayer__factory } from "../../../../typechain";
import { ConfigEntity } from "../../../entities";
import { getDeployer } from "../../../../utils/deployer-helper";
import { ConfigFileHelper } from "../../../helper";
import { UpgradeableContractDeployer } from "../../../deployer";
import { DeltaNeutralVaultsEntity } from "../../../interfaces/config";

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
  gateway: string;
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

  const deployer = await getDeployer();

  const configFileHelper = new ConfigFileHelper();
  let config = configFileHelper.getConfig();

  const POOL_ID = 2;

  const lpPoolAddress = config.YieldSources.Biswap!.pools.find((pool) => pool.pId === POOL_ID)!.address;

  const deltaVaultInputs: IDeltaNeutralVaultInput[] = [
    {
      name: "Market Neutral 3x BNB-USDT BS1",
      symbol: "n3x-BNBUSDT-BS1",
      stableVaultSymbol: "ibUSDT",
      assetVaultSymbol: "ibWBNB",
      stableSymbol: "USDT",
      assetSymbol: "WBNB",
      lpAddress: lpPoolAddress,
      deltaNeutralVaultConfig: "changeme",
      stableDeltaWorker: "changeme",
      assetDeltaWorker: "changeme",
      gateway: "changeme",
    },
  ];

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

    const deltaVaultDeployer = new UpgradeableContractDeployer<DeltaNeutralVault>(
      deployer,
      "DeltaNeutralVault",
      deltaVaultInputs[i].name
    );
    const { contract: deltaNeutralVault, deployedBlock } = await deltaVaultDeployer.deploy([
      deltaVaultInputs[i].name,
      deltaVaultInputs[i].symbol,
      stableVault.address,
      assetVault.address,
      deltaVaultInputs[i].stableDeltaWorker,
      deltaVaultInputs[i].assetDeltaWorker,
      deltaVaultInputs[i].lpAddress,
      alpacaTokenAddress,
      // TODO: check
      config.Oracle.DeltaNeutralOracle!,
      deltaVaultInputs[i].deltaNeutralVaultConfig,
    ]);

    const deltaNuetralVaultEntity: DeltaNeutralVaultsEntity = {
      name: deltaVaultInputs[i].name,
      symbol: deltaVaultInputs[i].symbol,
      address: deltaNeutralVault.address,
      deployedBlock: deployedBlock,
      config: deltaVaultInputs[i].deltaNeutralVaultConfig,
      assetToken: assetVault.baseToken,
      stableToken: stableVault.baseToken,
      assetVault: assetVault.address,
      stableVault: stableVault.address,
      assetDeltaWorker: deltaVaultInputs[i].assetDeltaWorker,
      stableDeltaWorker: deltaVaultInputs[i].stableDeltaWorker,
      gateway: deltaVaultInputs[i].gateway,
      oracle: config.Oracle.DeltaNeutralOracle!,
      assetVaultPosId: "-1",
      stableVaultPosId: "-1",
    };

    config = configFileHelper.addOrSetDeltaNeutralVaults(deltaNeutralVault.address, deltaNuetralVaultEntity);

    if (deltaVaultInputs[i].assetVaultSymbol === "ibWBNB" || deltaVaultInputs[i].assetVaultSymbol === "ibFTM") {
      console.log(`>> Set Caller ok for deltaNeutralVault if have native asset`);
      const wNativeRelayer = WNativeRelayer__factory.connect(wNativeRelayerAddr, deployer);
      await (await wNativeRelayer.setCallerOk([deltaNeutralVault.address], true)).wait(3);
      console.log("✅ Done");
    }
  }
};

export default func;
func.tags = ["BiswapDeltaNeutralVault"];
