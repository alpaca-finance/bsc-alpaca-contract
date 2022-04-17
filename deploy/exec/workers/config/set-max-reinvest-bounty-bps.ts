import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { ethers, network } from "hardhat";
import { Timelock__factory } from "../../../../typechain";
import MainnetConfig from "../../../../.mainnet.json";
import TestnetConfig from "../../../../.testnet.json";
import { TimelockEntity } from "../../../entities";
import { fileService, TimelockService } from "../../../services";

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
  const fileName = "mainnet-xALPACA-set-max-reinvest-bounty-bps";
  const workerInputs: Array<string> = [
    "USDT-BTCB MdexWorker",
    "ETH-BTCB MdexWorker",
    "WBNB-BTCB MdexWorker",
    "BTCB-USDT MdexWorker",
    "ETH-USDT MdexWorker",
    "WBNB-USDT MdexWorker",
    "USDC-USDT MdexWorker",
    "DAI-USDT MdexWorker",
    "USDT-ETH MdexWorker",
    "WBNB-ETH MdexWorker",
    "BTCB-ETH MdexWorker",
    "MDX-BUSD MdexWorker",
    "WBNB-BUSD MdexWorker",
    "MDX-WBNB MdexWorker",
    "BUSD-WBNB MdexWorker",
    "ETH-WBNB MdexWorker",
    "USDT-WBNB MdexWorker",
    "BTCB-WBNB MdexWorker",
    "BUSD-TUSD PancakeswapWorker",
    "ETH-BTCB PancakeswapWorker",
    "BUSD-BTCB PancakeswapWorker",
    "WBNB-BTCB PancakeswapWorker",
    "USDC-USDT PancakeswapWorker",
    "CAKE-USDT PancakeswapWorker",
    "WBNB-USDT PancakeswapWorker",
    "BUSD-USDT PancakeswapWorker",
    "BUSD-ALPACA PancakeswapWorker",
    "BTCB-ETH PancakeswapWorker",
    "WBNB-ETH PancakeswapWorker",
    "SUSHI-ETH PancakeswapWorker",
    "COMP-ETH PancakeswapWorker",
    "BMON-BUSD PancakeswapWorker",
    "POTS-BUSD PancakeswapWorker",
    "PHA-BUSD PancakeswapWorker",
    "PMON-BUSD PancakeswapWorker",
    "BTT-BUSD PancakeswapWorker",
    "TRX-BUSD PancakeswapWorker",
    "ORBS-BUSD PancakeswapWorker",
    "TUSD-BUSD PancakeswapWorker",
    "FORM-BUSD PancakeswapWorker",
    "CAKE-BUSD PancakeswapWorker",
    "ALPACA-BUSD PancakeswapWorker",
    "BTCB-BUSD PancakeswapWorker",
    "UST-BUSD PancakeswapWorker",
    "DAI-BUSD PancakeswapWorker",
    "USDC-BUSD PancakeswapWorker",
    "VAI-BUSD PancakeswapWorker",
    "WBNB-BUSD PancakeswapWorker",
    "USDT-BUSD PancakeswapWorker",
    "SPS-WBNB PancakeswapWorker",
    "BMON-WBNB PancakeswapWorker",
    "QBT-WBNB PancakeswapWorker",
    "DVI-WBNB PancakeswapWorker",
    "MBOX-WBNB PancakeswapWorker",
    "NAOS-WBNB PancakeswapWorker",
    "AXS-WBNB PancakeswapWorker",
    "ADA-WBNB PancakeswapWorker",
    "ODDZ-WBNB PancakeswapWorker",
    "USDT-WBNB PancakeswapWorker",
    "DODO-WBNB PancakeswapWorker",
    "SWINGBY-WBNB PancakeswapWorker",
    "pCWS-WBNB PancakeswapWorker",
    "BELT-WBNB PancakeswapWorker",
    "bMXX-WBNB PancakeswapWorker",
    "BUSD-WBNB PancakeswapWorker",
    "YFI-WBNB PancakeswapWorker",
    "XVS-WBNB PancakeswapWorker",
    "LINK-WBNB PancakeswapWorker",
    "UNI-WBNB PancakeswapWorker",
    "DOT-WBNB PancakeswapWorker",
    "ETH-WBNB PancakeswapWorker",
    "BTCB-WBNB PancakeswapWorker",
    "CAKE-WBNB PancakeswapWorker",
  ];
  const MAX_REINVEST_BOUNTY_BPS = "900";
  const EXACT_ETA = "1639720800";

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

  const TO_BE_UPDATED_WORKERS: IWorkers = workerInputs.map((workerInput) => {
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

  for (let i = 0; i < TO_BE_UPDATED_WORKERS.length; i++) {
    timelockTransactions.push(
      await TimelockService.queueTransaction(
        `setting max reinvest bounty bps for ${TO_BE_UPDATED_WORKERS[i].WORKER_NAME}`,
        TO_BE_UPDATED_WORKERS[i].ADDRESS,
        "0",
        "setMaxReinvestBountyBps(uint256)",
        ["uint256"],
        [MAX_REINVEST_BOUNTY_BPS],
        EXACT_ETA,
        { nonce: nonce++, gasPrice: ethers.utils.parseUnits("10", "gwei") }
      )
    );
  }

  fileService.writeJson(fileName, timelockTransactions);
};

export default func;
func.tags = ["TimelockSetMaxReinvestBountyBpsWorkers02"];
