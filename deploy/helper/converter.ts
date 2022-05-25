import { DeltaNeutralVaultsEntity } from "./../interfaces/config";
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

  public convertDeltaSymbolToAddress(symbols: string[], fieldResult: keyof DeltaNeutralVaultsEntity) {
    this._validateDeltaSymbol(symbols);
    return symbols.map((s) => this._convertDeltaSymbolToAddr(s, fieldResult));
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

  private _convertDeltaSymbolToAddr(symbol: string, fieldName: keyof DeltaNeutralVaultsEntity): string {
    const deltaVaultConfig = this.config.DeltaNeutralVaults.find((o) => compare(o.symbol, symbol));
    if (!deltaVaultConfig) {
      throw new Error(`ERROR : DELTA_VAULT_SYMBOL is INVALID : ${symbol}`);
    }

    return typeof deltaVaultConfig[fieldName] === "number"
      ? deltaVaultConfig[fieldName].toString()
      : (deltaVaultConfig[fieldName] as string);
  }
}
