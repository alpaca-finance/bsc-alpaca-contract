import { network } from "hardhat";
import MainnetConfig from "../../.mainnet.json";
import TestnetConfig from "../../.testnet.json";
import FantomMainnetConfig from "../../.fantom_mainnet.json";
import FantomTestnetConfig from "../../.fantom_testnet.json";
import { Config } from "../interfaces/config";

export function getConfig(): Config {
  if (network.name === "mainnet" || network.name === "mainnetfork") {
    return MainnetConfig;
  }
  if (network.name === "testnet") {
    return TestnetConfig;
  }
  if (network.name === "fantom_mainnet" || network.name === "fantom_mainnetfork") {
    return FantomMainnetConfig;
  }
  if (network.name === "fantom_testnet") {
    return FantomTestnetConfig;
  }

  throw new Error("not found config");
}
