import { DeltaNeutralVaultsEntity, VaultsEntity, WorkersEntity } from "./../interfaces/config";
import { compare } from "../../utils/address";
import { getConfig } from "../entities/config";
import { Config } from "../interfaces/config";

export class Converter {
  private config: Config;

  constructor() {
    this.config = getConfig();
  }

  public convertCreditorNameToAddress(names: string[]) {
    this._validateCreditorName(names);
    return names.map((name) => {
      return this.config.Creditors!.find((creditor) => compare(creditor.name, name))!.address;
    });
  }

  public convertDeltaSymboltoObj(symbols: string[]): DeltaNeutralVaultsEntity[] {
    this._validateDeltaSymbol(symbols);
    return symbols.map((s) => this._convertDeltaSymbol(s) as DeltaNeutralVaultsEntity);
  }

  public convertDeltaSymbolToAddress(symbols: string[], fieldResult: keyof DeltaNeutralVaultsEntity): string[] {
    this._validateDeltaSymbol(symbols);
    return symbols.map((s) => this._convertDeltaSymbol(s, fieldResult) as string);
  }

  public convertAddressesToVaults(addresses: string[]): VaultsEntity[] {
    this._validateVault(addresses);
    return addresses.map((addr) => this._convertVaults(addr) as VaultsEntity);
  }

  public convertAddressesToWorkers(addresses: string[]): WorkersEntity[] {
    this._validateWorkers(addresses);
    return addresses.map((addr) => this._convertWorkers(addr) as WorkersEntity);
  }

  private _validateCreditorName(names: string[]) {
    names.map((creditorName) => {
      const creditorResult = this.config.Creditors!.find((o) => compare(o.name, creditorName));
      if (!creditorResult) {
        throw new Error(`ERROR Not found Creditor Input :${creditorName}`);
      }

      if (creditorResult === undefined) {
        throw `error: not found creditor with name ${creditorName} `;
      }

      if (creditorResult.address === "") {
        throw `error: not found creditor config address`;
      }
    });
  }

  private _validateDeltaSymbol(symbols: string[]) {
    symbols.map((v) => {
      if (!this.config.DeltaNeutralVaults.find((dlt) => compare(dlt.symbol, v))) {
        throw new Error(`ERROR NOT FOUND VAULT ADDRESS :${v}`);
      }
    });
  }

  private _validateVault(inputs: string[]) {
    inputs.map((input) => {
      if (!this.config.Vaults.find((v) => compare(v.address, input))) {
        throw new Error(`ERROR NOT FOUND VAULT ADDRESS :${input}`);
      }
    });
  }

  private _validateWorkers(inputs: string[]) {
    for (const input of inputs) {
      let validatedWorker = false;
      for (const vault of this.config.Vaults) {
        if (vault.workers.find((w) => compare(w.address, input))) {
          validatedWorker = true;
          break;
        }
      }
      if (!validatedWorker) {
        throw new Error(`ERROR NOT FOUND WORKER ADDRESS :${input}`);
      }
    }
  }

  private _convertWorkers(input: string, fieldName?: keyof WorkersEntity): string | WorkersEntity {
    let workerObj;
    this._validateWorkers([input]);
    for (const vault of this.config.Vaults) {
      workerObj = vault.workers.find((w) => compare(w.address, input));
      if (workerObj) break;
    }
    if (!workerObj) throw new Error(`ERROR : WORKER_INPUT is INVALID : ${input}`);

    if (!fieldName) return workerObj;

    switch (typeof workerObj[fieldName]) {
      case "number": // for case blockNumber
        return workerObj[fieldName].toString();

      case "string":
        return workerObj[fieldName] as string;

      default:
        throw new Error(`NOT SUPPORT KEY of key ${fieldName}`);
    }
  }

  private _convertVaults(input: string, fieldName?: keyof VaultsEntity): string | VaultsEntity | WorkersEntity[] {
    const vaultObj = this.config.Vaults.find((o) => compare(o.address, input));
    if (!vaultObj) {
      throw new Error(`ERROR : VAULT_SYMBOL is INVALID : ${input}`);
    }

    if (!fieldName) {
      return vaultObj;
    }

    if (fieldName === "workers") {
      return vaultObj.workers;
    }

    switch (typeof vaultObj[fieldName]) {
      case "number": // for case blockNumber
        return vaultObj[fieldName].toString();

      case "string":
        return vaultObj[fieldName] as string;

      default:
        throw new Error(`NOT SUPPORT KEY of key ${fieldName}`);
    }
  }

  private _convertDeltaSymbol(
    symbol: string,
    fieldName?: keyof DeltaNeutralVaultsEntity
  ): string | DeltaNeutralVaultsEntity {
    const deltaVaultObj = this.config.DeltaNeutralVaults.find((o) => compare(o.symbol, symbol));
    if (!deltaVaultObj) {
      throw new Error(`ERROR : DELTA_VAULT_SYMBOL is INVALID : ${symbol}`);
    }

    if (!fieldName) {
      return deltaVaultObj;
    }

    switch (typeof deltaVaultObj[fieldName]) {
      case "number": // for case blockNumber
        return deltaVaultObj[fieldName].toString();

      case "string":
        return deltaVaultObj[fieldName] as string;

      default:
        throw new Error(`NOT SUPPORT KEY of key ${fieldName}`);
    }
  }
}
