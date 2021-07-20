import * as fs from 'fs';

export async function write(fileName:string, content: any) {
  const timestamp = Math.floor(Date.now()/1000)
  fs.writeFileSync(
    `./deploy/results/${fileName}_${timestamp}.json`,
    JSON.stringify(content, null, 2)
  )
}