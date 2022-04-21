import { CallOverrides } from "@ethersproject/contracts";
import { ethers } from "hardhat";
import { Timelock__factory } from "../../typechain";
import { getDeployer } from "../../utils/deployer-helper";
import { ConfigEntity, TimelockEntity } from "../entities";

export async function queueTransaction(
  info: string,
  target: string,
  value: string,
  signature: string,
  paramTypes: Array<string>,
  params: Array<any>,
  eta: string,
  overrides?: CallOverrides
): Promise<TimelockEntity.Transaction> {
  const deployer = await getDeployer();
  console.log(`------------------`);
  console.log(`>> Queue tx for: ${info}`);
  const config = ConfigEntity.getConfig();
  const timelock = Timelock__factory.connect(config.Timelock, deployer);
  const queueTx = await timelock.queueTransaction(
    target,
    value,
    signature,
    ethers.utils.defaultAbiCoder.encode(paramTypes, params),
    eta,
    overrides
  );
  await queueTx.wait();
  const paramTypesStr = paramTypes.map((p) => `'${p}'`);
  const paramsStr = params.map((p) => {
    if (Array.isArray(p)) {
      const vauleWithQuote = p.map((p) => {
        if (typeof p === "string") return `'${p}'`;
        return JSON.stringify(p);
      });
      return `[${vauleWithQuote}]`;
    }

    if (typeof p === "string") {
      return `'${p}'`;
    }

    return p;
  });

  const executionTx = `await timelock.executeTransaction('${target}', '${value}', '${signature}', ethers.utils.defaultAbiCoder.encode([${paramTypesStr}], [${paramsStr}]), '${eta}')`;
  console.log(`>> Done.`);
  return {
    info: info,
    queuedAt: queueTx.hash,
    executedAt: "",
    executionTransaction: executionTx,
    target,
    value,
    signature,
    paramTypes,
    params,
    eta,
  };
}

export async function executeTransaction(
  info: string,
  queuedAt: string,
  executionTx: string,
  target: string,
  value: string,
  signature: string,
  paramTypes: Array<string>,
  params: Array<any>,
  eta: string,
  overrides?: CallOverrides
): Promise<TimelockEntity.Transaction> {
  console.log(`>> Execute tx for: ${info}`);
  const config = ConfigEntity.getConfig();
  const timelock = Timelock__factory.connect(config.Timelock, (await ethers.getSigners())[0]);
  const executeTx = await timelock.executeTransaction(
    target,
    value,
    signature,
    ethers.utils.defaultAbiCoder.encode(paramTypes, params),
    eta,
    overrides
  );
  console.log(`>> Done.`);

  return {
    info: info,
    queuedAt: queuedAt,
    executedAt: executeTx.hash,
    executionTransaction: executionTx,
    target,
    value,
    signature,
    paramTypes,
    params,
    eta,
  };
}
