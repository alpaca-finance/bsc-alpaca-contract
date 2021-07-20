import { ethers } from 'hardhat';
import { Timelock__factory } from '../../typechain';
import { ConfigEntity, TimelockEntity } from "../entities";

export async function queueTransaction(
  info: string,
  target: string,
  value: string,
  signature: string,
  paramTypes: Array<string>,
  params: Array<any>,
  eta: string,
): Promise<TimelockEntity.Transaction> {
  console.log(`>> Queue tx for: ${info}`)
  const config = ConfigEntity.getConfig()
  const timelock = Timelock__factory.connect(config.Timelock, (await ethers.getSigners())[0])
  const queueTx = await timelock.queueTransaction(
    target,
    value,
    signature,
    ethers.utils.defaultAbiCoder.encode(paramTypes, params),
    eta
  )
  const paramTypesStr = paramTypes.map((p) => `'${p}'`)
  const paramsStr = params.map((p) => {
    if(Array.isArray(p)) {
      const vauleWithQuote = p.map((p) => `'${p}'`)
      return `[${vauleWithQuote}]`
    }

    return p
  })

  const executionTx = `await timelock.executionTransaction('${target}', '${value}', '${signature}', ethers.utils.defaultAbiCoder.encode([${paramTypesStr}], [${paramsStr}]), '${eta}')`
  console.log(`>> Done.`)
  return {
    info: info,
    queuedAt: queueTx.hash,
    executionTransaction: executionTx,
    target,
    value,
    signature,
    paramTypes,
    params,
    eta,
  }
}