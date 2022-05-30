import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { ethers } from "hardhat";
import { TimelockEntity } from "../../../entities";
import { fileService, TimelockService } from "../../../services";
import { getConfig } from "../../../entities/config";
import { PancakeswapV2MCV2Worker02, PancakeswapV2MCV2Worker02__factory } from "../../../../typechain";
import { compare } from "../../../../utils/address";

interface IWorker {
  WORKER_NAME: string;
  WORKER: PancakeswapV2MCV2Worker02;
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
  const fileName = "mainnet-revenue-tresury-set-beneficial-vault-config-pancake";
  const workerInputs = [
    "WFTM-USDC SpookyWorker",
    "TUSD-USDC SpookyWorker",
    "BOO-USDC SpookyWorker",
    "WFTM-ALPACA SpookyWorker",
  ];
  const rewardPathInput: Array<string> = ["BOO", "WFTM"];
  const BENEFICIAL_VAULT_BOUNTY_BPS = "5555";
  const BENEFICIAL_VAULT_ADDRESS = "0x795997Ad55AcFc27148E86408355eC08cA1424A0";
  const EXACT_ETA = "1649136600";

  const config = getConfig();
  const deployer = (await ethers.getSigners())[0];

  const allWorkers: IWorkers = config.Vaults.reduce((accum, vault) => {
    return accum.concat(
      vault.workers.map((worker) => {
        return {
          WORKER_NAME: worker.name,
          WORKER: PancakeswapV2MCV2Worker02__factory.connect(worker.address, deployer),
        };
      })
    );
  }, [] as IWorkers);

  // get REWARD_PATH as a list of address based on a list of its symbol on config.Tokens
  const REWARD_PATH: Array<string> = rewardPathInput.map((tokenName) => {
    const hit = (config.Tokens as unknown as Record<string, string | undefined>)[tokenName];
    if (!!hit) return hit;
    throw new Error(`could not find ${tokenName}`);
  });
  const REWARD_PATH_STRINGIFY: string = REWARD_PATH.map((path) => `'${path}'`).join(",");
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
  const timelockTransactions: Array<TimelockEntity.Transaction> = [];
  let nonce = await deployer.getTransactionCount();

  for (let i = 0; i < TO_BE_UPGRADE_WORKERS.length; i++) {
    const owner = await TO_BE_UPGRADE_WORKERS[i].WORKER.owner();

    if (compare(owner, config.Timelock)) {
      timelockTransactions.push(
        await TimelockService.queueTransaction(
          `setting beneficial vault params for ${TO_BE_UPGRADE_WORKERS[i].WORKER_NAME}`,
          TO_BE_UPGRADE_WORKERS[i].WORKER.address,
          "0",
          "setBeneficialVaultConfig(uint256,address,address[])",
          ["uint256", "address", "address[]"],
          [BENEFICIAL_VAULT_BOUNTY_BPS, BENEFICIAL_VAULT_ADDRESS, REWARD_PATH],
          EXACT_ETA,
          { nonce: nonce++, gasPrice: ethers.utils.parseUnits("10", "gwei") }
        )
      );
    } else {
      console.log("-------------");
      console.log(`> Setting beneficial vault for ${TO_BE_UPGRADE_WORKERS[i].WORKER_NAME}`);
      const tx = await TO_BE_UPGRADE_WORKERS[i].WORKER.setBeneficialVaultConfig(
        BENEFICIAL_VAULT_BOUNTY_BPS,
        BENEFICIAL_VAULT_ADDRESS,
        REWARD_PATH
      );
      await tx.wait(3);
      console.log(`> Transaction hash: ${tx.hash}`);
      console.log("> ✅ Done");
    }
  }

  if (timelockTransactions.length > 0) {
    fileService.writeJson(fileName, timelockTransactions);
  }
};

export default func;
func.tags = ["TimelockAddBeneficialBuybackFieldsWorkers02"];
