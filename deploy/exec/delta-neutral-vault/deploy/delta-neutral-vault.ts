import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { ethers } from "hardhat";
import { DeltaNeutralBiswapWorker03__factory, DeltaNeutralVault, WNativeRelayer__factory } from "../../../../typechain";
import { getDeployer } from "../../../../utils/deployer-helper";
import { ConfigFileHelper } from "../../../helper";
import { UpgradeableContractDeployer } from "../../../deployer";
import { DeltaNeutralVaultsEntity, DeltaNeutralVaultTokens } from "../../../interfaces/config";
import { validateAddress } from "../../../../utils/address";

interface IDeltaNeutralVaultInput {
  name: string;
  symbol: string;
  stableVaultSymbol: string;
  assetVaultSymbol: string;
  stableSymbol: string;
  assetSymbol: string;
  stableDeltaWorkerName: string;
  assetDeltaWorkerName: string;
  lpAddress: string;
  deltaNeutralVaultConfig?: string;
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

  // prepare variable
  const deltaVaultInputs: IDeltaNeutralVaultInput[] = [
    {
      name: "Long 3x BUSD-BNB PCS1",
      symbol: "L3x-BUSDBNB-PCS1",
      stableVaultSymbol: "ibWBNB",
      assetVaultSymbol: "ibBUSD",
      stableSymbol: "WBNB",
      assetSymbol: "BUSD",
      stableDeltaWorkerName: "BUSD-WBNB L3x PCS1 DeltaNeutralPancakeswapWorker", // Address of stable deltaneutral worker
      assetDeltaWorkerName: "WBNB-BUSD L3x PCS1 DeltaNeutralPancakeswapWorker", // Address of asset deltaneutral worker
      lpAddress: "0x58F876857a02D6762E0101bb5C46A8c1ED44Dc16",
    },
  ];

  const alpacaTokenAddress = config.Tokens.ALPACA;
  const wNativeRelayerAddr = config.SharedConfig.WNativeRelayer;
  for (let i = 0; i < deltaVaultInputs.length; i++) {
    const deltaVaultInput = deltaVaultInputs[i];
    const stableVault = config.Vaults.find((v) => v.symbol === deltaVaultInput.stableVaultSymbol);
    const assetVault = config.Vaults.find((v) => v.symbol === deltaVaultInput.assetVaultSymbol);
    if (stableVault === undefined) {
      throw `error: unable to find vault from ${deltaVaultInput.stableVaultSymbol}`;
    }
    if (assetVault === undefined) {
      throw `error: unable to find vault from ${deltaVaultInput.assetVaultSymbol}`;
    }

    if (!deltaVaultInput.deltaNeutralVaultConfig) {
      const deltaVault = config.DeltaNeutralVaults.find((dv) => dv.symbol === deltaVaultInput.symbol);
      if (!deltaVault) throw Error(`Couldn't find DeltaNeutralVaults[${deltaVaultInput.symbol}]`);
      if (!validateAddress(deltaVault.config))
        throw Error(`DeltaNeutralVaults[${deltaVaultInput.symbol}] > config (${deltaVault.config}) address is invalid`);
      deltaVaultInput.deltaNeutralVaultConfig = deltaVault.config;
    }

    // get worker addresses from config file
    const stableWorkerAddress = stableVault.workers.find(
      (worker) => worker.name === deltaVaultInput.stableDeltaWorkerName
    )?.address;
    if (!stableWorkerAddress || !validateAddress(stableWorkerAddress)) {
      throw `error: unable to find worker ${deltaVaultInput.stableDeltaWorkerName} from ${deltaVaultInput.stableVaultSymbol} workers`;
    }
    const assetWorkerAddress = assetVault.workers.find(
      (worker) => worker.name === deltaVaultInput.assetDeltaWorkerName
    )?.address;
    if (!assetWorkerAddress || !validateAddress(assetWorkerAddress)) {
      throw `error: unable to find worker ${deltaVaultInput.assetDeltaWorkerName} from ${deltaVaultInput.assetVaultSymbol} workers`;
    }

    const deltaVaultDeployer = new UpgradeableContractDeployer<DeltaNeutralVault>(
      deployer,
      "DeltaNeutralVault",
      deltaVaultInput.name
    );

    const { contract: deltaNeutralVault, deployedBlock } = await deltaVaultDeployer.deploy([
      deltaVaultInput.name,
      deltaVaultInput.symbol,
      stableVault.address,
      assetVault.address,
      stableWorkerAddress,
      assetWorkerAddress,
      deltaVaultInput.lpAddress,
      alpacaTokenAddress,
      config.Oracle.DeltaNeutralOracle!,
      deltaVaultInput.deltaNeutralVaultConfig,
    ]);

    if (deltaVaultInput.assetVaultSymbol === "ibWBNB" || deltaVaultInput.assetVaultSymbol === "ibFTM") {
      console.log(`>> Set Caller ok for deltaNeutralVault if have native asset`);
      const wNativeRelayer = WNativeRelayer__factory.connect(wNativeRelayerAddr, deployer);
      await (await wNativeRelayer.setCallerOk([deltaNeutralVault.address], true)).wait(3);
      console.log("✅ Done");
    }

    // set whitelisted caller on workers
    let nonce = await deployer.getTransactionCount();

    const whitelistedWorkers = [
      { name: deltaVaultInput.stableDeltaWorkerName, address: stableWorkerAddress },
      { name: deltaVaultInput.assetDeltaWorkerName, address: assetWorkerAddress },
    ];

    for (let worker of whitelistedWorkers) {
      console.log(`>> Set Whitelisted Caller for Delta Neutral Vault on`, worker.name);
      const workerAsDeployer = DeltaNeutralBiswapWorker03__factory.connect(worker.address, deployer);
      await workerAsDeployer.setWhitelistedCallers([deltaNeutralVault.address], true, { nonce: nonce++ });
      console.log("✅ Done");
    }

    const deltaNuetralVaultEntity: DeltaNeutralVaultsEntity = {
      name: deltaVaultInput.name,
      symbol: deltaVaultInput.symbol,
      address: deltaNeutralVault.address,
      deployedBlock: deployedBlock,
      config: deltaVaultInput.deltaNeutralVaultConfig,
      assetToken: assetVault.baseToken,
      stableToken: stableVault.baseToken,
      assetVault: assetVault.address,
      stableVault: stableVault.address,
      assetDeltaWorker: assetWorkerAddress,
      stableDeltaWorker: stableWorkerAddress,
      oracle: config.Oracle.DeltaNeutralOracle!,
      gateway: ethers.constants.AddressZero,
      assetVaultPosId: "0",
      stableVaultPosId: "0",
    };

    config = configFileHelper.addOrSetDeltaNeutralVaults(deltaVaultInput.symbol, deltaNuetralVaultEntity);
    config = configFileHelper.addOrSetToken(
      deltaVaultInput.symbol as keyof DeltaNeutralVaultTokens,
      deltaNeutralVault.address
    );
  }
};

export default func;
func.tags = ["DeltaNeutralVault"];
