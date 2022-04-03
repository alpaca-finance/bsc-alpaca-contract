import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { ethers } from "hardhat";
import { ConfigEntity } from "../../../entities";
import { SpookyWorker03__factory } from "./../../../../typechain/factories/SpookyWorker03__factory";
import { TombWorker03__factory } from "./../../../../typechain/factories/TombWorker03__factory";
import { getDeployer } from "../../../../utils/deployer-helper";

interface IWorker {
  WORKER_NAME: string;
  ADDRESS: string;
}

type IWorkers = Array<IWorker>;

/**
 * @description Deployment script for setting workers' beneficial vault related data
 * @param  {HardhatRuntimeEnvironment} hre
 */
const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  /*
  ░██╗░░░░░░░██╗░█████╗░██████╗░███╗░░██╗██╗███╗░░██╗░██████╗░
  ░██║░░██╗░░██║██╔══██╗██╔══██╗████╗░██║██║████╗░██║██╔════╝░
  ░╚██╗████╗██╔╝███████║██████╔╝██╔██╗██║██║██╔██╗██║██║░░██╗░
  ░░████╔═████║░██╔══██║██╔══██╗██║╚████║██║██║╚████║██║░░╚██╗
  ░░╚██╔╝░╚██╔╝░██║░░██║██║░░██║██║░╚███║██║██║░╚███║╚██████╔╝
  ░░░╚═╝░░░╚═╝░░╚═╝░░╚═╝╚═╝░░╚═╝╚═╝░░╚══╝╚═╝╚═╝░░╚══╝░╚═════╝░
  Check all variables below before execute the deployment script
  */
  const workerInputs = ["WFTM-TOMB TombWorker", "TSHARE-WFTM TombWorker", "TOMB-WFTM TombWorker"];
  const rewardPathInput: Array<string> = ["TSHARE", "WFTM", "ALPACA"];
  const BENEFICIAL_VAULT_BOUNTY_BPS = "5555";
  const BENEFICIAL_VAULT_ADDRESS = "0xe32840F950F709148fdB9Ff22712083Ac40033A0";

  const config = ConfigEntity.getConfig();
  const allWorkers: IWorkers = config.Vaults.reduce((accum, vault) => {
    return accum.concat(
      vault.workers.map((worker) => {
        return {
          WORKER_NAME: worker.name,
          ADDRESS: worker.address,
        };
      })
    );
  }, [] as IWorkers);

  // get REWARD_PATH as a list of address based on a list of its symbol on config.Tokens
  const REWARD_PATH: Array<string> = rewardPathInput.map((tokenName) => {
    const hit = (config.Tokens as unknown as Record<string, string | undefined>)[tokenName];
    if (!!hit) return hit;
    throw new Error("could not find ${tokenName}");
  });
  const TO_BE_UPGRADE_WORKERS: IWorkers = workerInputs.map((workerInput) => {
    // 1. find each worker having an identical name as workerInput
    // 2. if hit return
    // 3. other wise throw error
    const hit = allWorkers.find((worker) => {
      return worker.WORKER_NAME === workerInput;
    });

    if (!!hit) return hit;

    throw new Error(`could not find ${workerInput}`);
  });
  const deployer = await getDeployer();
  let nonce = await deployer.getTransactionCount();

  for (let i = 0; i < TO_BE_UPGRADE_WORKERS.length; i++) {
    console.log(`>> Set beneficial vault config for ${TO_BE_UPGRADE_WORKERS[i].WORKER_NAME}`);
    const spookyWorker03 = SpookyWorker03__factory.connect(TO_BE_UPGRADE_WORKERS[i].ADDRESS, deployer);
    await spookyWorker03.setBeneficialVaultConfig(BENEFICIAL_VAULT_BOUNTY_BPS, BENEFICIAL_VAULT_ADDRESS, REWARD_PATH, {
      nonce: nonce++,
    });
    console.log("✅ Done");
  }
};

export default func;
func.tags = ["SetBeneficialBuybackFieldsWorkers03"];
