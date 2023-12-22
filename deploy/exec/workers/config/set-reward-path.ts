import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

import { ethers } from "ethers";
import { PancakeswapV2MCV2Worker02__factory } from "../../../../typechain";
import { compare } from "../../../../utils/address";
import { getDeployer } from "../../../../utils/deployer-helper";
import { ConfigEntity, TimelockEntity } from "../../../entities";
import { fileService, TimelockService } from "../../../services";

interface IWorker {
  WORKER_NAME: string;
  ADDRESS: string;
}

type IWorkers = Array<IWorker>;

interface IWorkerRewardPathConfigInput {
  WORKER_NAME: string;
  REWARD_PATH?: Array<string>;
}

type IWorkerRewardPathConfigInputs = Array<IWorkerRewardPathConfigInput>;

/**
 * @description Deployment script for upgrades workers to 02 version
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

  const TITLE = "set-workers-reward-path-to-usdt";
  const EXACT_ETA = "1702474200";
  const workerInputs: IWorkerRewardPathConfigInputs = [
    // CAKE
    {
      WORKER_NAME: "USDT-CAKE PancakeswapWorker",
      REWARD_PATH: ["CAKE", "USDT"],
    },
    {
      WORKER_NAME: "WBNB-CAKE PancakeswapWorker",
      REWARD_PATH: ["CAKE", "USDT"],
    },
    // WBNB PCS
    {
      WORKER_NAME: "BUSD-WBNB PancakeswapWorker",
      REWARD_PATH: ["CAKE", "USDT"],
    },
    {
      WORKER_NAME: "BTCB-WBNB PancakeswapWorker",
      REWARD_PATH: ["CAKE", "USDT"],
    },
    {
      WORKER_NAME: "USDT-WBNB PancakeswapWorker",
      REWARD_PATH: ["CAKE", "USDT"],
    },
    {
      WORKER_NAME: "DOT-WBNB PancakeswapWorker",
      REWARD_PATH: ["CAKE", "USDT"],
    },
    {
      WORKER_NAME: "CAKE-WBNB PancakeswapWorker",
      REWARD_PATH: ["CAKE", "USDT"],
    },
    {
      WORKER_NAME: "AXS-WBNB PancakeswapWorker",
      REWARD_PATH: ["CAKE", "USDT"],
    },
    {
      WORKER_NAME: "UNI-WBNB PancakeswapWorker",
      REWARD_PATH: ["CAKE", "USDT"],
    },
    {
      WORKER_NAME: "LINK-WBNB PancakeswapWorker",
      REWARD_PATH: ["CAKE", "USDT"],
    },
    {
      WORKER_NAME: "ADA-WBNB PancakeswapWorker",
      REWARD_PATH: ["CAKE", "USDT"],
    },
    {
      WORKER_NAME: "TINC-WBNB PancakeswapWorker",
      REWARD_PATH: ["CAKE", "USDT"],
    },
    {
      WORKER_NAME: "THG-WBNB PancakeswapWorker",
      REWARD_PATH: ["CAKE", "USDT"],
    },
    {
      WORKER_NAME: "WBNB CakeMaxiWorker",
      REWARD_PATH: ["CAKE", "USDT"],
    },
    {
      WORKER_NAME: "SPS-WBNB PancakeswapWorker",
      REWARD_PATH: ["CAKE", "USDT"],
    },
    {
      WORKER_NAME: "DVI-WBNB PancakeswapWorker",
      REWARD_PATH: ["CAKE", "USDT"],
    },
    {
      WORKER_NAME: "DODO-WBNB PancakeswapWorker",
      REWARD_PATH: ["CAKE", "USDT"],
    },
    {
      WORKER_NAME: "ETH-WBNB PancakeswapWorker",
      REWARD_PATH: ["CAKE", "USDT"],
    },
    {
      WORKER_NAME: "BMON-WBNB PancakeswapWorker",
      REWARD_PATH: ["CAKE", "USDT"],
    },
    {
      WORKER_NAME: "ETERNAL-WBNB PancakeswapWorker",
      REWARD_PATH: ["CAKE", "USDT"],
    },
    {
      WORKER_NAME: "ODDZ-WBNB PancakeswapWorker",
      REWARD_PATH: ["CAKE", "USDT"],
    },
    {
      WORKER_NAME: "MBOX-WBNB PancakeswapWorker",
      REWARD_PATH: ["CAKE", "USDT"],
    },
    {
      WORKER_NAME: "NAOS-WBNB PancakeswapWorker",
      REWARD_PATH: ["CAKE", "USDT"],
    },
    {
      WORKER_NAME: "QBT-WBNB PancakeswapWorker",
      REWARD_PATH: ["CAKE", "USDT"],
    },
    {
      WORKER_NAME: "BELT-WBNB PancakeswapWorker",
      REWARD_PATH: ["CAKE", "USDT"],
    },
    {
      WORKER_NAME: "BRY-WBNB PancakeswapWorker",
      REWARD_PATH: ["CAKE", "USDT"],
    },
    {
      WORKER_NAME: "bMXX-WBNB PancakeswapWorker",
      REWARD_PATH: ["CAKE", "USDT"],
    },
    {
      WORKER_NAME: "XVS-WBNB PancakeswapWorker",
      REWARD_PATH: ["CAKE", "USDT"],
    },
    {
      WORKER_NAME: "SWINGBY-WBNB PancakeswapWorker",
      REWARD_PATH: ["CAKE", "USDT"],
    },
    {
      WORKER_NAME: "ITAM-WBNB PancakeswapWorker",
      REWARD_PATH: ["CAKE", "USDT"],
    },

    // USDT PCS
    {
      WORKER_NAME: "WBNB-USDT PancakeswapWorker",
      REWARD_PATH: ["CAKE", "USDT"],
    },
    {
      WORKER_NAME: "CAKE-USDT PancakeswapWorker",
      REWARD_PATH: ["CAKE", "USDT"],
    },
    {
      WORKER_NAME: "BUSD-USDT PancakeswapWorker",
      REWARD_PATH: ["CAKE", "USDT"],
    },
    {
      WORKER_NAME: "USDC-USDT PancakeswapWorker",
      REWARD_PATH: ["CAKE", "USDT"],
    },
    {
      WORKER_NAME: "USDT CakeMaxiWorker",
      REWARD_PATH: ["CAKE", "USDT"],
    },

    // USDT BSW
    {
      WORKER_NAME: "WBNB-USDT BiswapWorker",
      REWARD_PATH: ["BSW", "USDT"],
    },
    {
      WORKER_NAME: "BSW-USDT BiswapWorker",
      REWARD_PATH: ["BSW", "USDT"],
    },
    {
      WORKER_NAME: "BTCB-USDT BiswapWorker",
      REWARD_PATH: ["BSW", "USDT"],
    },
    {
      WORKER_NAME: "ETH-USDT BiswapWorker",
      REWARD_PATH: ["BSW", "USDT"],
    },

    // WBNB BSW
    {
      WORKER_NAME: "USDT-WBNB BiswapWorker",
      REWARD_PATH: ["BSW", "USDT"],
    },
    {
      WORKER_NAME: "ETH-WBNB BiswapWorker",
      REWARD_PATH: ["BSW", "USDT"],
    },
    {
      WORKER_NAME: "BSW-WBNB BiswapWorker",
      REWARD_PATH: ["BSW", "USDT"],
    },
    {
      WORKER_NAME: "USDC-WBNB BiswapWorker",
      REWARD_PATH: ["BSW", "USDT"],
    },
    {
      WORKER_NAME: "BUSD-WBNB BiswapWorker",
      REWARD_PATH: ["BSW", "USDT"],
    },
  ];
  let NONCE = 21665;

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

  const rewardPathConfigs = workerInputs.map((rewardPathConfig) => {
    // 1. find each worker having an identical name as workerInput
    // 2. if hit return
    // 3. other wise throw error
    const hit = allWorkers.find((worker) => {
      return worker.WORKER_NAME === rewardPathConfig.WORKER_NAME;
    });
    if (hit === undefined) throw new Error(`could not find ${rewardPathConfig.WORKER_NAME}`);

    const tokenList: any = config.Tokens;
    let rewardPath: Array<string> = [];
    if (rewardPathConfig.REWARD_PATH) {
      rewardPath = rewardPathConfig.REWARD_PATH.map((p) => {
        const addr = tokenList[p];
        if (addr === undefined) {
          throw `error: path: unable to find address of ${p}`;
        }
        return addr;
      });
    }

    return {
      WORKER_NAME: hit.WORKER_NAME,
      ADDRESS: hit.ADDRESS,
      REWARD_PATH: rewardPath,
    };
  });

  const deployer = await getDeployer();
  const chainId = await deployer.getChainId();
  const timelockTransactions: Array<TimelockEntity.Transaction> = [];

  for (const rewardPathConfig of rewardPathConfigs) {
    const worker = PancakeswapV2MCV2Worker02__factory.connect(rewardPathConfig.ADDRESS, deployer);
    const owner = await worker.owner();

    if (compare(owner, config.Timelock)) {
      timelockTransactions.push(
        await TimelockService.queueTransaction(
          chainId,
          `setting rewardPath ${rewardPathConfig.WORKER_NAME}`,
          rewardPathConfig.ADDRESS,
          "0",
          "setRewardPath(address[])",
          ["address[]"],
          [rewardPathConfig.REWARD_PATH],
          EXACT_ETA,
          { nonce: NONCE++, gasPrice: ethers.utils.parseUnits("10", "gwei") }
        )
      );
    } else {
      await worker.setRewardPath(rewardPathConfig.REWARD_PATH, {
        nonce: NONCE++,
        gasPrice: ethers.utils.parseUnits("10", "gwei"),
      });
      console.log("✅ Done");
    }
  }
  if (timelockTransactions.length > 0) {
    const timestamp = Math.floor(new Date().getTime() / 1000);
    fileService.writeJson(`${timestamp}_${TITLE}`, timelockTransactions);
  }
};

export default func;
func.tags = ["SetRewardPathWorkers"];
