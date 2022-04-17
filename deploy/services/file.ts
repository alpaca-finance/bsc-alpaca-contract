import * as fs from "fs";

export function readJson(filePath: string): any {
  const raw = fs.readFileSync(filePath);
  const json = JSON.parse(raw.toString());
  return json;
}

export function writeJson(fileName: string, content: any) {
  const timestamp = Math.floor(Date.now() / 1000);
  fs.writeFileSync(`./deploy/results/${fileName}.json`, JSON.stringify(content, null, 2));
}
