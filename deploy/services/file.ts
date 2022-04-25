import * as fs from "fs";

export function readJson(filePath: string): any {
  const raw = fs.readFileSync(filePath);
  const json = JSON.parse(raw.toString());
  return json;
}

export function writeJson(fileName: string, content: any) {
  const exists = fs.existsSync("./deploy/results");
  if (!exists) {
    fs.mkdirSync("./deploy/results");
  }
  fs.writeFileSync(`./deploy/results/${fileName}.json`, JSON.stringify(content, null, 2));
}
