import * as fs from 'fs';

export function write(fileName:string, content: any) {
  const timestamp = Math.floor(Date.now()/1000)
  fs.writeFileSync(
    `./deploy/results/${timestamp}_${fileName}.json`,
    JSON.stringify(content, null, 2)
  )
}