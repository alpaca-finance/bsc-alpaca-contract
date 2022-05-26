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

  public convertDeltaSymboltoObj(symbols: string[]): DeltaNeutralVaultsEntity[] {
    this._validateDeltaSymbol(symbols);
    return symbols.map((s) => this._convertDeltaSymbol(s) as DeltaNeutralVaultsEntity);
  }

  public convertDeltaSymbolToAddress(symbols: string[], fieldResult: keyof DeltaNeutralVaultsEntity) {
    this._validateDeltaSymbol(symbols);
    return symbols.map((s) => this._convertDeltaSymbol(s, fieldResult));
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

    return typeof deltaVaultObj[fieldName] === "number"
      ? deltaVaultObj[fieldName].toString()
      : (deltaVaultObj[fieldName] as string);
  }
}
