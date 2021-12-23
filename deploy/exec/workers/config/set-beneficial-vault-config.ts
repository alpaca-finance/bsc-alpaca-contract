import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { ethers, network } from "hardhat";
import MainnetConfig from "../../../../.mainnet.json";
import TestnetConfig from "../../../../.testnet.json";
import { TimelockEntity } from "../../../entities";
import { FileService, TimelockService } from "../../../services";

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
  const fileName = "mainnet-xALPACA-set-beneficial-vault-config-cakemaxi";
  const workerInputs = [
    "TUSD CakeMaxiWorker",
    "BTCB CakeMaxiWorker",
    "USDT CakeMaxiWorker",
    "ETH CakeMaxiWorker",
    "BUSD CakeMaxiWorker",
    "WBNB CakeMaxiWorker",
  ];
  const rewardPathInput: Array<string> = ["CAKE", "BUSD", "ALPACA"];
  const EXACT_ETA = "1640242800";
  const BENEFICIAL_VAULT_BOUNTY_BPS = "5263";
  const BENEFICIAL_VAULT_ADDRESS = "0x44B3868cbba5fbd2c5D8d1445BDB14458806B3B4";

  const config = network.name === "mainnet" ? MainnetConfig : TestnetConfig;
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
  const deployer = (await ethers.getSigners())[0];
  const timelockTransactions: Array<TimelockEntity.Transaction> = [];
  let nonce = await deployer.getTransactionCount();

  for (let i = 0; i < TO_BE_UPGRADE_WORKERS.length; i++) {
    timelockTransactions.push(
      await TimelockService.queueTransaction(
        `setting beneficial vault params for ${TO_BE_UPGRADE_WORKERS[i].WORKER_NAME}`,
        TO_BE_UPGRADE_WORKERS[i].ADDRESS,
        "0",
        "setBeneficialVaultConfig(uint256,address,address[])",
        ["uint256", "address", "address[]"],
        [BENEFICIAL_VAULT_BOUNTY_BPS, BENEFICIAL_VAULT_ADDRESS, REWARD_PATH],
        EXACT_ETA,
        { nonce: nonce++, gasPrice: ethers.utils.parseUnits("10", "gwei") }
      )
    );
  }

  FileService.write(fileName, timelockTransactions);
};

export default func;
func.tags = ["TimelockAddBeneficialBuybackFieldsWorkers02"];
