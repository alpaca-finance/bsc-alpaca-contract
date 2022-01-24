import { network } from "hardhat";
import MainnetConfig from "../../.mainnet.json";
import TestnetConfig from "../../.testnet.json";
import FantomTestnetConfig from "../../.fantomtestnet.json";
import { Config } from "../interfaces/config";

export function getConfig(): Config {
  if (network.name === "mainnet" || network.name === "mainnetfork") {
    return MainnetConfig;
  }
  if (network.name === "fantomtestnet") {
    return FantomTestnetConfig;
  }
  return TestnetConfig;
}
