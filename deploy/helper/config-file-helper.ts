import * as fs from "fs";
import { network } from "hardhat";
import { compare } from "../../utils/address";
import { getConfig } from "../entities/config";
import {
  Config,
  SharedStrategiesGroup,
  SharedStrategies,
  StrategyAddTwoSidesOptimal,
  WorkersEntity,
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
          this.filePath = `.fantom_mainnet.json`;
          break;
        case "fantom_testnet":
        case "fantom_mainnetfork":
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

  // Vaults
  public setVaultWorker(vaultNameOrSymbolOrAddress: string, value: WorkersEntity): Config {
    console.log(`>> Updating config on Vaults[${vaultNameOrSymbolOrAddress}] > workers`);
    const vaultIdx = this.config.Vaults.findIndex(
      (v) =>
        v.name === vaultNameOrSymbolOrAddress ||
        v.symbol === vaultNameOrSymbolOrAddress ||
        compare(v.address, vaultNameOrSymbolOrAddress)
    );
    if (vaultIdx === -1) throw Error("[ConfigFileHelper::setWorkerEntity]: Vault not found");
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
    const vaultIdx = this.config.Vaults.findIndex(
      (v) =>
        v.name === vaultNameOrSymbolOrAddress ||
        v.symbol === vaultNameOrSymbolOrAddress ||
        compare(v.address, vaultNameOrSymbolOrAddress)
    );
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

  private _writeConfigFile(config: Config) {
    console.log(`>> Writing ${this.filePath}`);
    fs.writeFileSync(this.filePath, JSON.stringify(config, null, 2));
    console.log("✅ Done");
  }
}
