import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { ethers } from "hardhat";
import {
  DeltaNeutralBiswapWorker03__factory,
  DeltaNeutralVault03,
  DirectionalVault,
  WNativeRelayer__factory,
} from "../../../../typechain";
import { getDeployer } from "../../../../utils/deployer-helper";
import { ConfigFileHelper } from "../../../helper";
import { UpgradeableContractDeployer } from "../../../deployer";
import { DeltaNeutralVaultsEntity, DeltaNeutralVaultTokens } from "../../../interfaces/config";
import { validateAddress } from "../../../../utils/address";

interface IDirectionalVaultInput {
  name: string;
  symbol: string;
  stableVaultSymbol: string;
  stableSymbol: string;
  assetSymbol: string;
  stableVaultWorkerName: string;
  lpAddress: string;
  assetTokenAddress: string;
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
  const vaultInputs: IDirectionalVaultInput[] = [
    {
      name: "Bull 6x BNB-USDT PCS1",
      symbol: "bull6x-BNBUSDT-PCS1",
      stableVaultSymbol: "ibUSDT",
      stableSymbol: "USDT",
      assetSymbol: "WBNB",
      stableVaultWorkerName: "WBNB-USDT 6x PCS1 DirectionalPancakeswapWorker", // Address of stable vault worker
      lpAddress: "0x16b9a82891338f9bA80E2D6970FddA79D1eb0daE",
      assetTokenAddress: "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c",
    },
  ];

  const alpacaTokenAddress = config.Tokens.ALPACA;
  const wNativeRelayerAddr = config.SharedConfig.WNativeRelayer;
  for (let i = 0; i < vaultInputs.length; i++) {
    const vaultInput = vaultInputs[i];
    const stableVault = config.Vaults.find((v) => v.symbol === vaultInput.stableVaultSymbol);
    if (stableVault === undefined) {
      throw new Error(`error: unable to find vault from ${vaultInput.stableVaultSymbol}`);
    }

    if (!vaultInput.deltaNeutralVaultConfig) {
      const deltaVault = config.DeltaNeutralVaults.find((dv) => dv.symbol === vaultInput.symbol);
      if (!deltaVault) throw Error(`Couldn't find DeltaNeutralVaults[${vaultInput.symbol}]`);
      if (!validateAddress(deltaVault.config))
        throw new Error(`DeltaNeutralVaults[${vaultInput.symbol}] > config (${deltaVault.config}) address is invalid`);
      vaultInput.deltaNeutralVaultConfig = deltaVault.config;
    }

    // get worker addresses from config file
    const stableWorkerAddress = stableVault.workers.find(
      (worker) => worker.name === vaultInput.stableVaultWorkerName
    )?.address;
    if (!stableWorkerAddress || !validateAddress(stableWorkerAddress)) {
      throw new Error(
        `error: unable to find worker ${vaultInput.stableVaultWorkerName} from ${vaultInput.stableVaultSymbol} workers`
      );
    }

    const directionalVaultDeployer = new UpgradeableContractDeployer<DirectionalVault>(
      deployer,
      "DirectionalVault",
      vaultInput.name
    );

    const { contract: deltaNeutralVault, deployedBlock } = await directionalVaultDeployer.deploy([
      vaultInput.name,
      vaultInput.symbol,
      stableVault.address,
      stableWorkerAddress,
      vaultInput.lpAddress,
      alpacaTokenAddress,
      vaultInput.assetTokenAddress,
      config.Oracle.DeltaNeutralOracle!,
      vaultInput.deltaNeutralVaultConfig,
    ]);

    console.log(`>> Set Caller ok for deltaNeutralVault if have native asset`);
    const wNativeRelayer = WNativeRelayer__factory.connect(wNativeRelayerAddr, deployer);
    await (await wNativeRelayer.setCallerOk([deltaNeutralVault.address], true)).wait(3);
    console.log("✅ Done");

    // set whitelisted caller on workers
    let nonce = await deployer.getTransactionCount();

    const whitelistedWorkers = [{ name: vaultInput.stableVaultWorkerName, address: stableWorkerAddress }];

    for (let worker of whitelistedWorkers) {
      console.log(`>> Set Whitelisted Caller for Delta Neutral Vault on`, worker.name);
      const workerAsDeployer = DeltaNeutralBiswapWorker03__factory.connect(worker.address, deployer);
      await workerAsDeployer.setWhitelistedCallers([deltaNeutralVault.address], true, {
        gasLimit: 2000000,
        nonce: nonce++,
      });
      console.log("✅ Done");
    }

    const deltaNuetralVaultEntity: DeltaNeutralVaultsEntity = {
      name: vaultInput.name,
      symbol: vaultInput.symbol,
      address: deltaNeutralVault.address,
      deployedBlock: deployedBlock,
      config: vaultInput.deltaNeutralVaultConfig,
      assetToken: vaultInput.assetTokenAddress,
      stableToken: stableVault.baseToken,
      assetVault: "",
      stableVault: stableVault.address,
      assetDeltaWorker: "",
      stableDeltaWorker: stableWorkerAddress,
      oracle: config.Oracle.DeltaNeutralOracle!,
      gateway: ethers.constants.AddressZero,
      assetVaultPosId: "0",
      stableVaultPosId: "0",
    };

    config = configFileHelper.addOrSetDeltaNeutralVaults(vaultInput.symbol, deltaNuetralVaultEntity);
    config = configFileHelper.addOrSetToken(
      vaultInput.symbol as keyof DeltaNeutralVaultTokens,
      deltaNeutralVault.address
    );
  }
};

export default func;
func.tags = ["DirectionalVault"];
