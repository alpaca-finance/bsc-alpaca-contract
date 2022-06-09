import { Nft } from "./../interfaces/config";
import * as fs from "fs";
import { ethers, network } from "hardhat";
import { compare } from "../../utils/address";
import { getConfig } from "../entities/config";
import {
  Config,
  SharedStrategiesGroup,
  SharedStrategies,
  StrategyAddTwoSidesOptimal,
  WorkersEntity,
  DeltaNeutralVaultsEntity,
  Tokens,
  PoolsEntity,
  YieldPoolsEntity,
  YieldSources,
  Creditor,
} from "../interfaces/config";

export class ConfigFileHelper {
  private config: Config;
  private filePath: string;

  constructor(overrideFilePath?: string) {
    this.config = getConfig();
    if (!!overrideFilePath) {
      this.filePath = overrideFilePath;
    } else {
      switch (network.name) {
        case "mainnet":
        case "mainnetfork":
          this.filePath = `.mainnet.json`;
          break;
        case "testnet":
          this.filePath = `.testnet.json`;
          break;
        case "fantom_mainnet":
        case "fantom_mainnetfork":
          this.filePath = `.fantom_mainnet.json`;
          break;
        case "fantom_testnet":
          this.filePath = `.fantom_testnet.json`;
          break;
        default:
          throw Error("Unsupported network");
      }
    }
  }

  public getConfig(): Config {
    return this.config;
  }

  // Tokens
  public addOrSetToken(key: keyof Tokens, address: string): Config {
    console.log(`>> Updating config on Tokens > ${key}, address: ${address}`);
    const token = this.config.Tokens[key];

    if (!token) {
      this.config.Tokens[key] = address;
      console.log(`>> Added Tokens.${key}, address: ${address}`);
    } else {
      this.config.Tokens[key] = address;
      console.log(`>> Updated Tokens.${key}, address: ${address}`);
    }
    console.log("✅ Done");

    this._writeConfigFile(this.config);
    return this.config;
  }

  // Vaults
  public addOrSetVaultWorker(vaultNameOrSymbolOrAddress: string, value: WorkersEntity): Config {
    console.log(`>> Updating config on Vaults[${vaultNameOrSymbolOrAddress}] > workers`);
    const vaultIdx = this._findVaultIdxByNameOrSymbolOrAddress(vaultNameOrSymbolOrAddress);
    if (vaultIdx === -1) throw Error("[ConfigFileHelper::addOrSetVaultWorker]: Vault not found");
    const vaultWorkers = this.config.Vaults[vaultIdx].workers;
    const workerIdx = vaultWorkers.findIndex((w) => w.name === value.name);

    if (workerIdx === -1) {
      this.config.Vaults[vaultIdx].workers = [...vaultWorkers, value];
      console.log(`>> Added worker ${value.name} address: ${value.address}`);
    } else {
      this.config.Vaults[vaultIdx].workers[workerIdx] = value;
      console.log(`>> Updated worker ${value.name} address: ${value.address}`);
    }
    console.log("✅ Done");

    this._writeConfigFile(this.config);
    return this.config;
  }

  public setVaultTwosideOptimalOnKey(
    vaultNameOrSymbolOrAddress: string,
    key: keyof StrategyAddTwoSidesOptimal,
    value: string
  ) {
    console.log(`>> Updating config on Vaults[${vaultNameOrSymbolOrAddress}] > StrategyAddTwoSidesOptimal > ${key}`);
    const vaultIdx = this._findVaultIdxByNameOrSymbolOrAddress(vaultNameOrSymbolOrAddress);
    if (vaultIdx === -1) throw Error("[ConfigFileHelper::setVaultTwosideOptimalOnKey]: Vault not found");
    const strategyTwoSidesOptimal = this.config.Vaults[vaultIdx]!.StrategyAddTwoSidesOptimal[key];
    if (!strategyTwoSidesOptimal)
      throw Error(
        `[ConfigFileHelper::setVaultTwosideOptimalOnKey]: Vaults.StrategyAddTwoSidesOptimal key [${key}] not found`
      );
    this.config.Vaults[vaultIdx]!.StrategyAddTwoSidesOptimal[key] = value;
    console.log("✅ Done");

    this._writeConfigFile(this.config);
    return this.config;
  }

  // SharedStategies
  public setSharedStrategyOnKey(
    key: keyof SharedStrategies,
    strategyKey: keyof SharedStrategiesGroup,
    value: string
  ): Config {
    console.log(`>> Updating config on SharedStrategies > ${key} > ${strategyKey} address: ${value}`);
    const strategies = this.config.SharedStrategies[key];
    if (!strategies) throw Error(`[ConfigFileHelper::setSharedStrategyOnKey]: SharedStrategies key [${key}] not found`);
    this.config.SharedStrategies[key]! = {
      ...strategies,
      [strategyKey]: value,
    };
    console.log("✅ Done");

    this._writeConfigFile(this.config);
    return this.config;
  }

  // DeltaNeutralVaults
  // NOTE: should use symbol as a key because delta vault config always deploy before delta vault.
  public addOrSetDeltaNeutralVaultsConfig(symbol: string, value: string) {
    console.log(`>> Updating config on DeltaNeutralVaults[${symbol}] > config`);
    const idx = this.config.DeltaNeutralVaults.findIndex((dv) => dv.symbol === symbol);
    if (idx === -1) {
      this.config.DeltaNeutralVaults = [
        ...this.config.DeltaNeutralVaults,
        {
          ...defaultDeltaNeutralVaultsEntity,
          symbol,
          config: value,
        } as DeltaNeutralVaultsEntity,
      ];
      console.log(`>> Added DeltaNeutralVault[${symbol}] > config address: ${value}`);
    } else {
      const deltaVault = this.config.DeltaNeutralVaults[idx];
      this.config.DeltaNeutralVaults[idx] = {
        ...deltaVault,
        config: value,
      };
      console.log(`>> Updated DeltaNeutralVault[${symbol}] > config address: ${value}`);
    }
    console.log("✅ Done");

    this._writeConfigFile(this.config);
    return this.config;
  }

  // NOTE: should use symbol as a key to work with delta neutral config deployment script.
  public addOrSetDeltaNeutralVaults(symbol: string, value: DeltaNeutralVaultsEntity) {
    console.log(`>> Updating config on DeltaNeutralVaults address: ${value.address}`);
    const idx = this.config.DeltaNeutralVaults.findIndex((dv) => dv.symbol === symbol);
    if (idx === -1) {
      this.config.DeltaNeutralVaults = [...this.config.DeltaNeutralVaults, value];
      console.log(`>> Added DeltaNeutralVault ${value.name} address: ${value.address}`);
    } else {
      this.config.DeltaNeutralVaults[idx] = value;
      console.log(`>> Updated DeltaNeutralVault ${value.name} address: ${value.address}`);
    }
    console.log("✅ Done");

    this._writeConfigFile(this.config);
    return this.config;
  }

  public setDeltaNeutralGateway(nameOrSymbolOrAddress: string, value: string) {
    console.log(`>> Updating config on DeltaNeutralVaults > gateway address: ${value}`);
    const idx = this._findDeltaNeurtralVaultIdxByNameOrSymbolOrAddress(nameOrSymbolOrAddress);
    if (idx === -1)
      throw Error(
        `[ConfigFileHelper::setDeltaNeutralGateway]: DeltaNeutralVaults not found [${nameOrSymbolOrAddress}]`
      );

    this.config.DeltaNeutralVaults[idx].gateway = value;
    console.log("✅ Done");

    this._writeConfigFile(this.config);
    return this.config;
  }

  public setDeltaNeutralVaultsInitPositionIds(
    nameOrSymbolOrAddress: string,
    vaultPositionIds: {
      stableVaultPosId: string;
      assetVaultPosId: string;
    }
  ) {
    console.log(
      `>> Updating config on DeltaNeutralVaults > { assetVaultPosId: ${vaultPositionIds.assetVaultPosId}, stableVaultPosId: ${vaultPositionIds.stableVaultPosId} }`
    );
    const idx = this._findDeltaNeurtralVaultIdxByNameOrSymbolOrAddress(nameOrSymbolOrAddress);
    if (idx === -1)
      throw Error(
        `[ConfigFileHelper::setDeltaNeutralVaultsInitPositionIds]: DeltaNeutralVaults not found [${nameOrSymbolOrAddress}]`
      );

    this.config.DeltaNeutralVaults[idx].stableVaultPosId = vaultPositionIds.stableVaultPosId;
    this.config.DeltaNeutralVaults[idx].assetVaultPosId = vaultPositionIds.assetVaultPosId;
    console.log("✅ Done");

    this._writeConfigFile(this.config);
    return this.config;
  }

  public addOrSetYielPool(yieldSource: keyof YieldSources, pool: YieldPoolsEntity) {
    console.log(`>> Adding a new pool to YieldPools > ${yieldSource}`);
    if (this.config.YieldSources[yieldSource] === undefined)
      throw new Error("[ConfigFileHelper::addOrSetYieldPool]: YieldSource not found");

    this.config.YieldSources[yieldSource]!.pools = [...this.config.YieldSources[yieldSource]!.pools, pool];

    this._writeConfigFile(this.config);
    return this.config;
  }

  private _writeConfigFile(config: Config) {
    console.log(`>> Writing ${this.filePath}`);
    fs.writeFileSync(this.filePath, JSON.stringify(config, null, 2));
    console.log("✅ Done");
  }

  private _findVaultIdxByNameOrSymbolOrAddress(nameOrSymbolOrAddress: string): number {
    return this.config.Vaults.findIndex(
      (v) =>
        v.name === nameOrSymbolOrAddress ||
        v.symbol === nameOrSymbolOrAddress ||
        compare(v.address, nameOrSymbolOrAddress)
    );
  }

  private _findDeltaNeurtralVaultIdxByNameOrSymbolOrAddress(nameOrSymbolOrAddress: string): number {
    return this.config.DeltaNeutralVaults.findIndex(
      (v) =>
        v.name === nameOrSymbolOrAddress ||
        v.symbol === nameOrSymbolOrAddress ||
        compare(v.address, nameOrSymbolOrAddress)
    );
  }

  // AutomatedVaultController
  public setAVController(address: string) {
    console.log(`>> SET AVController to file > ${address}`);
    this.config.AutomatedVaultController = {
      address,
      creditors: [],
    };
    this._writeConfigFile(this.config);
  }

  public setCreditToAVController(creditorAddrs: string[]) {
    console.log(`>> SET Creditors to AVController > ${creditorAddrs}`);

    const avControllerObj = this.config.AutomatedVaultController;
    if (!avControllerObj) {
      throw new Error(">> Error Please Deploy AVController first");
    }

    avControllerObj.creditors = creditorAddrs;
    this._writeConfigFile(this.config);
  }

  // Creditors
  public addOrSetCreditors(creditor: Creditor) {
    console.log(`>> Adding Creditors to file> ${JSON.stringify(creditor)}`);
    if (this.config.Creditors === undefined) {
      this.config.Creditors = [creditor];
    } else {
      this.config.Creditors = [...this.config.Creditors, creditor];
    }
    this._writeConfigFile(this.config);
  }

  // NFtStaking
  public addNFTStaking(nftStaking: string) {
    console.log(`>> Adding NFTStaking to file > ${nftStaking}`);
    if (this.config.NFT === undefined) {
      this.config.NFT = {
        NFTStaking: nftStaking,
      } as Nft;
    } else {
      this.config.NFT.NFTStaking = nftStaking;
    }
    this._writeConfigFile(this.config);
  }
}

const defaultDeltaNeutralVaultsEntity: DeltaNeutralVaultsEntity = {
  name: "",
  symbol: "",
  address: ethers.constants.AddressZero,
  deployedBlock: 0,
  config: ethers.constants.AddressZero,
  assetToken: ethers.constants.AddressZero,
  stableToken: ethers.constants.AddressZero,
  assetVault: ethers.constants.AddressZero,
  stableVault: ethers.constants.AddressZero,
  assetDeltaWorker: ethers.constants.AddressZero,
  stableDeltaWorker: ethers.constants.AddressZero,
  gateway: ethers.constants.AddressZero,
  oracle: ethers.constants.AddressZero,
  assetVaultPosId: "0",
  stableVaultPosId: "0",
};
