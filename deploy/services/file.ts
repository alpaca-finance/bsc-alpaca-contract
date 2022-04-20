import * as fs from "fs";
import { network } from "hardhat";
import { Config } from "../interfaces/config";

export function readJson(filePath: string): any {
  const raw = fs.readFileSync(filePath);
  const json = JSON.parse(raw.toString());
  return json;
}

export function writeJson(fileName: string, content: any, timestampInput?: number) {
  const timestamp = timestampInput ?? Math.floor(Date.now() / 1000);
  fs.writeFileSync(`./deploy/results/${timestamp}_${fileName}.json`, JSON.stringify(content, null, 2));
}

export function writeConfigJson(config: Config) {
  switch (network.name) {
    case "mainnet":
    case "mainnetfork":
      fs.writeFileSync(`.mainnet.json`, JSON.stringify(config, null, 2));
      break;
    case "testnet":
      fs.writeFileSync(`.testnet.json`, JSON.stringify(config, null, 2));
      break;
    case "fantom_mainnet":
      fs.writeFileSync(`.fantom_mainnet.json`, JSON.stringify(config, null, 2));
      break;
    case "fantom_testnet":
    case "fantom_mainnetfork":
      fs.writeFileSync(`.fantom_testnet.json`, JSON.stringify(config, null, 2));
      break;
    default:
      fs.writeFileSync(`.default.json`, JSON.stringify(config, null, 2));
      break;
  }
}
