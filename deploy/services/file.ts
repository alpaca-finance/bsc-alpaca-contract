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
  const exists = fs.existsSync("./deploy/results");
  if (!exists) {
    fs.mkdirSync("./deploy/results");
  }
  fs.writeFileSync(`./deploy/results/${timestamp}_${fileName}.json`, JSON.stringify(content, null, 2));
}
