import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { ethers, network } from "hardhat";
import { Timelock__factory } from "../../../../typechain";
import MainnetConfig from "../../../../.mainnet.json";
import TestnetConfig from "../../../../.testnet.json";
import { fileService, TimelockService } from "../../../services";
import { TimelockEntity } from "../../../entities";

interface IWorker {
  WORKER_NAME: string;
  ADDRESS: string;
}

type IWorkers = Array<IWorker>;

interface IWorkerReinvestConfig {
  WORKER_NAME: string;
  ADDRESS: string;
  REINVEST_BOUNTY_BPS: string;
  REINVEST_THRESHOLD: string;
  REINVEST_PATH: Array<string>;
}

type IWorkerReinvestConfigs = Array<IWorkerReinvestConfig>;

interface IWorkerReinvestConfigInput {
  WORKER_NAME: string;
  REINVEST_BOUNTY_BPS: string;
  REINVEST_THRESHOLD: string;
  REINVEST_PATH?: Array<string>;
}

type IWorkerReinvestConfigInputs = Array<IWorkerReinvestConfigInput>;

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
  const title = "mainnet-xALPACA-set-reinvest-config";
  const workerInputs: IWorkerReinvestConfigInputs = [
    {
      WORKER_NAME: "USDT-BTCB MdexWorker",
      REINVEST_BOUNTY_BPS: "900",
      REINVEST_THRESHOLD: "33",
      REINVEST_PATH: ["MDX", "WBNB", "BTCB"],
    },
    {
      WORKER_NAME: "ETH-BTCB MdexWorker",
      REINVEST_BOUNTY_BPS: "900",
      REINVEST_THRESHOLD: "33",
      REINVEST_PATH: ["MDX", "WBNB", "BTCB"],
    },
    {
      WORKER_NAME: "WBNB-BTCB MdexWorker",
      REINVEST_BOUNTY_BPS: "900",
      REINVEST_THRESHOLD: "33",
      REINVEST_PATH: ["MDX", "WBNB", "BTCB"],
    },
    {
      WORKER_NAME: "BTCB-USDT MdexWorker",
      REINVEST_BOUNTY_BPS: "900",
      REINVEST_THRESHOLD: "33",
      REINVEST_PATH: ["MDX", "USDT"],
    },
    {
      WORKER_NAME: "ETH-USDT MdexWorker",
      REINVEST_BOUNTY_BPS: "900",
      REINVEST_THRESHOLD: "33",
      REINVEST_PATH: ["MDX", "USDT"],
    },
    {
      WORKER_NAME: "WBNB-USDT MdexWorker",
      REINVEST_BOUNTY_BPS: "900",
      REINVEST_THRESHOLD: "33",
      REINVEST_PATH: ["MDX", "USDT"],
    },
    {
      WORKER_NAME: "USDC-USDT MdexWorker",
      REINVEST_BOUNTY_BPS: "900",
      REINVEST_THRESHOLD: "33",
      REINVEST_PATH: ["MDX", "USDT"],
    },
    {
      WORKER_NAME: "DAI-USDT MdexWorker",
      REINVEST_BOUNTY_BPS: "900",
      REINVEST_THRESHOLD: "33",
      REINVEST_PATH: ["MDX", "USDT"],
    },
    {
      WORKER_NAME: "USDT-ETH MdexWorker",
      REINVEST_BOUNTY_BPS: "900",
      REINVEST_THRESHOLD: "33",
      REINVEST_PATH: ["MDX", "ETH"],
    },
    {
      WORKER_NAME: "WBNB-ETH MdexWorker",
      REINVEST_BOUNTY_BPS: "900",
      REINVEST_THRESHOLD: "33",
      REINVEST_PATH: ["MDX", "ETH"],
    },
    {
      WORKER_NAME: "BTCB-ETH MdexWorker",
      REINVEST_BOUNTY_BPS: "900",
      REINVEST_THRESHOLD: "33",
      REINVEST_PATH: ["MDX", "ETH"],
    },
    {
      WORKER_NAME: "MDX-BUSD MdexWorker",
      REINVEST_BOUNTY_BPS: "900",
      REINVEST_THRESHOLD: "33",
      REINVEST_PATH: ["MDX", "BUSD"],
    },
    {
      WORKER_NAME: "WBNB-BUSD MdexWorker",
      REINVEST_BOUNTY_BPS: "900",
      REINVEST_THRESHOLD: "33",
      REINVEST_PATH: ["MDX", "BUSD"],
    },
    {
      WORKER_NAME: "MDX-WBNB MdexWorker",
      REINVEST_BOUNTY_BPS: "900",
      REINVEST_THRESHOLD: "33",
      REINVEST_PATH: ["MDX", "WBNB"],
    },
    {
      WORKER_NAME: "BUSD-WBNB MdexWorker",
      REINVEST_BOUNTY_BPS: "900",
      REINVEST_THRESHOLD: "33",
      REINVEST_PATH: ["MDX", "WBNB"],
    },
    {
      WORKER_NAME: "ETH-WBNB MdexWorker",
      REINVEST_BOUNTY_BPS: "900",
      REINVEST_THRESHOLD: "33",
      REINVEST_PATH: ["MDX", "WBNB"],
    },
    {
      WORKER_NAME: "USDT-WBNB MdexWorker",
      REINVEST_BOUNTY_BPS: "900",
      REINVEST_THRESHOLD: "33",
      REINVEST_PATH: ["MDX", "WBNB"],
    },
    {
      WORKER_NAME: "BTCB-WBNB MdexWorker",
      REINVEST_BOUNTY_BPS: "900",
      REINVEST_THRESHOLD: "33",
      REINVEST_PATH: ["MDX", "WBNB"],
    },
    {
      WORKER_NAME: "BUSD-TUSD PancakeswapWorker",
      REINVEST_BOUNTY_BPS: "900",
      REINVEST_THRESHOLD: "1",
      REINVEST_PATH: ["CAKE", "BUSD", "TUSD"],
    },
    {
      WORKER_NAME: "ETH-BTCB PancakeswapWorker",
      REINVEST_BOUNTY_BPS: "900",
      REINVEST_THRESHOLD: "1",
      REINVEST_PATH: ["CAKE", "WBNB", "BTCB"],
    },
    {
      WORKER_NAME: "BUSD-BTCB PancakeswapWorker",
      REINVEST_BOUNTY_BPS: "900",
      REINVEST_THRESHOLD: "1",
      REINVEST_PATH: ["CAKE", "WBNB", "BTCB"],
    },
    {
      WORKER_NAME: "WBNB-BTCB PancakeswapWorker",
      REINVEST_BOUNTY_BPS: "900",
      REINVEST_THRESHOLD: "1",
      REINVEST_PATH: ["CAKE", "WBNB", "BTCB"],
    },
    {
      WORKER_NAME: "USDC-USDT PancakeswapWorker",
      REINVEST_BOUNTY_BPS: "900",
      REINVEST_THRESHOLD: "1",
      REINVEST_PATH: ["CAKE", "USDT"],
    },
    {
      WORKER_NAME: "CAKE-USDT PancakeswapWorker",
      REINVEST_BOUNTY_BPS: "900",
      REINVEST_THRESHOLD: "1",
      REINVEST_PATH: ["CAKE", "USDT"],
    },
    {
      WORKER_NAME: "WBNB-USDT PancakeswapWorker",
      REINVEST_BOUNTY_BPS: "900",
      REINVEST_THRESHOLD: "1",
      REINVEST_PATH: ["CAKE", "USDT"],
    },
    {
      WORKER_NAME: "BUSD-USDT PancakeswapWorker",
      REINVEST_BOUNTY_BPS: "900",
      REINVEST_THRESHOLD: "1",
      REINVEST_PATH: ["CAKE", "USDT"],
    },
    {
      WORKER_NAME: "BUSD-ALPACA PancakeswapWorker",
      REINVEST_BOUNTY_BPS: "900",
      REINVEST_THRESHOLD: "1",
      REINVEST_PATH: ["CAKE", "BUSD", "ALPACA"],
    },
    {
      WORKER_NAME: "BTCB-ETH PancakeswapWorker",
      REINVEST_BOUNTY_BPS: "900",
      REINVEST_THRESHOLD: "1",
      REINVEST_PATH: ["CAKE", "WBNB", "ETH"],
    },
    {
      WORKER_NAME: "WBNB-ETH PancakeswapWorker",
      REINVEST_BOUNTY_BPS: "900",
      REINVEST_THRESHOLD: "1",
      REINVEST_PATH: ["CAKE", "WBNB", "ETH"],
    },
    {
      WORKER_NAME: "SUSHI-ETH PancakeswapWorker",
      REINVEST_BOUNTY_BPS: "900",
      REINVEST_THRESHOLD: "1",
      REINVEST_PATH: ["CAKE", "WBNB", "ETH"],
    },
    {
      WORKER_NAME: "COMP-ETH PancakeswapWorker",
      REINVEST_BOUNTY_BPS: "900",
      REINVEST_THRESHOLD: "1",
      REINVEST_PATH: ["CAKE", "WBNB", "ETH"],
    },
    {
      WORKER_NAME: "BMON-BUSD PancakeswapWorker",
      REINVEST_BOUNTY_BPS: "900",
      REINVEST_THRESHOLD: "1",
      REINVEST_PATH: ["CAKE", "BUSD"],
    },
    {
      WORKER_NAME: "POTS-BUSD PancakeswapWorker",
      REINVEST_BOUNTY_BPS: "900",
      REINVEST_THRESHOLD: "1",
      REINVEST_PATH: ["CAKE", "BUSD"],
    },
    {
      WORKER_NAME: "PHA-BUSD PancakeswapWorker",
      REINVEST_BOUNTY_BPS: "900",
      REINVEST_THRESHOLD: "1",
      REINVEST_PATH: ["CAKE", "BUSD"],
    },
    {
      WORKER_NAME: "PMON-BUSD PancakeswapWorker",
      REINVEST_BOUNTY_BPS: "900",
      REINVEST_THRESHOLD: "1",
      REINVEST_PATH: ["CAKE", "BUSD"],
    },
    {
      WORKER_NAME: "BTT-BUSD PancakeswapWorker",
      REINVEST_BOUNTY_BPS: "900",
      REINVEST_THRESHOLD: "1",
      REINVEST_PATH: ["CAKE", "BUSD"],
    },
    {
      WORKER_NAME: "TRX-BUSD PancakeswapWorker",
      REINVEST_BOUNTY_BPS: "900",
      REINVEST_THRESHOLD: "1",
      REINVEST_PATH: ["CAKE", "BUSD"],
    },
    {
      WORKER_NAME: "ORBS-BUSD PancakeswapWorker",
      REINVEST_BOUNTY_BPS: "900",
      REINVEST_THRESHOLD: "1",
      REINVEST_PATH: ["CAKE", "BUSD"],
    },
    {
      WORKER_NAME: "TUSD-BUSD PancakeswapWorker",
      REINVEST_BOUNTY_BPS: "900",
      REINVEST_THRESHOLD: "1",
      REINVEST_PATH: ["CAKE", "BUSD"],
    },
    {
      WORKER_NAME: "FORM-BUSD PancakeswapWorker",
      REINVEST_BOUNTY_BPS: "900",
      REINVEST_THRESHOLD: "1",
      REINVEST_PATH: ["CAKE", "BUSD"],
    },
    {
      WORKER_NAME: "CAKE-BUSD PancakeswapWorker",
      REINVEST_BOUNTY_BPS: "900",
      REINVEST_THRESHOLD: "1",
      REINVEST_PATH: ["CAKE", "BUSD"],
    },
    {
      WORKER_NAME: "ALPACA-BUSD PancakeswapWorker",
      REINVEST_BOUNTY_BPS: "900",
      REINVEST_THRESHOLD: "1",
      REINVEST_PATH: ["CAKE", "BUSD"],
    },
    {
      WORKER_NAME: "BTCB-BUSD PancakeswapWorker",
      REINVEST_BOUNTY_BPS: "900",
      REINVEST_THRESHOLD: "1",
      REINVEST_PATH: ["CAKE", "BUSD"],
    },
    {
      WORKER_NAME: "UST-BUSD PancakeswapWorker",
      REINVEST_BOUNTY_BPS: "900",
      REINVEST_THRESHOLD: "1",
      REINVEST_PATH: ["CAKE", "BUSD"],
    },
    {
      WORKER_NAME: "DAI-BUSD PancakeswapWorker",
      REINVEST_BOUNTY_BPS: "900",
      REINVEST_THRESHOLD: "1",
      REINVEST_PATH: ["CAKE", "BUSD"],
    },
    {
      WORKER_NAME: "USDC-BUSD PancakeswapWorker",
      REINVEST_BOUNTY_BPS: "900",
      REINVEST_THRESHOLD: "1",
      REINVEST_PATH: ["CAKE", "BUSD"],
    },
    {
      WORKER_NAME: "VAI-BUSD PancakeswapWorker",
      REINVEST_BOUNTY_BPS: "900",
      REINVEST_THRESHOLD: "1",
      REINVEST_PATH: ["CAKE", "BUSD"],
    },
    {
      WORKER_NAME: "WBNB-BUSD PancakeswapWorker",
      REINVEST_BOUNTY_BPS: "900",
      REINVEST_THRESHOLD: "1",
      REINVEST_PATH: ["CAKE", "BUSD"],
    },
    {
      WORKER_NAME: "USDT-BUSD PancakeswapWorker",
      REINVEST_BOUNTY_BPS: "900",
      REINVEST_THRESHOLD: "1",
      REINVEST_PATH: ["CAKE", "BUSD"],
    },
    {
      WORKER_NAME: "SPS-WBNB PancakeswapWorker",
      REINVEST_BOUNTY_BPS: "900",
      REINVEST_THRESHOLD: "1",
      REINVEST_PATH: ["CAKE", "WBNB"],
    },
    {
      WORKER_NAME: "BMON-WBNB PancakeswapWorker",
      REINVEST_BOUNTY_BPS: "900",
      REINVEST_THRESHOLD: "1",
      REINVEST_PATH: ["CAKE", "WBNB"],
    },
    {
      WORKER_NAME: "QBT-WBNB PancakeswapWorker",
      REINVEST_BOUNTY_BPS: "900",
      REINVEST_THRESHOLD: "1",
      REINVEST_PATH: ["CAKE", "WBNB"],
    },
    {
      WORKER_NAME: "DVI-WBNB PancakeswapWorker",
      REINVEST_BOUNTY_BPS: "900",
      REINVEST_THRESHOLD: "1",
      REINVEST_PATH: ["CAKE", "WBNB"],
    },
    {
      WORKER_NAME: "MBOX-WBNB PancakeswapWorker",
      REINVEST_BOUNTY_BPS: "900",
      REINVEST_THRESHOLD: "1",
      REINVEST_PATH: ["CAKE", "WBNB"],
    },
    {
      WORKER_NAME: "NAOS-WBNB PancakeswapWorker",
      REINVEST_BOUNTY_BPS: "900",
      REINVEST_THRESHOLD: "1",
      REINVEST_PATH: ["CAKE", "WBNB"],
    },
    {
      WORKER_NAME: "AXS-WBNB PancakeswapWorker",
      REINVEST_BOUNTY_BPS: "900",
      REINVEST_THRESHOLD: "1",
      REINVEST_PATH: ["CAKE", "WBNB"],
    },
    {
      WORKER_NAME: "ADA-WBNB PancakeswapWorker",
      REINVEST_BOUNTY_BPS: "900",
      REINVEST_THRESHOLD: "1",
      REINVEST_PATH: ["CAKE", "WBNB"],
    },
    {
      WORKER_NAME: "ODDZ-WBNB PancakeswapWorker",
      REINVEST_BOUNTY_BPS: "900",
      REINVEST_THRESHOLD: "1",
      REINVEST_PATH: ["CAKE", "WBNB"],
    },
    {
      WORKER_NAME: "USDT-WBNB PancakeswapWorker",
      REINVEST_BOUNTY_BPS: "900",
      REINVEST_THRESHOLD: "1",
      REINVEST_PATH: ["CAKE", "WBNB"],
    },
    {
      WORKER_NAME: "DODO-WBNB PancakeswapWorker",
      REINVEST_BOUNTY_BPS: "900",
      REINVEST_THRESHOLD: "1",
      REINVEST_PATH: ["CAKE", "WBNB"],
    },
    {
      WORKER_NAME: "SWINGBY-WBNB PancakeswapWorker",
      REINVEST_BOUNTY_BPS: "900",
      REINVEST_THRESHOLD: "1",
      REINVEST_PATH: ["CAKE", "WBNB"],
    },
    {
      WORKER_NAME: "pCWS-WBNB PancakeswapWorker",
      REINVEST_BOUNTY_BPS: "900",
      REINVEST_THRESHOLD: "1",
      REINVEST_PATH: ["CAKE", "WBNB"],
    },
    {
      WORKER_NAME: "BELT-WBNB PancakeswapWorker",
      REINVEST_BOUNTY_BPS: "900",
      REINVEST_THRESHOLD: "1",
      REINVEST_PATH: ["CAKE", "WBNB"],
    },
    {
      WORKER_NAME: "bMXX-WBNB PancakeswapWorker",
      REINVEST_BOUNTY_BPS: "900",
      REINVEST_THRESHOLD: "1",
      REINVEST_PATH: ["CAKE", "WBNB"],
    },
    {
      WORKER_NAME: "BUSD-WBNB PancakeswapWorker",
      REINVEST_BOUNTY_BPS: "900",
      REINVEST_THRESHOLD: "1",
      REINVEST_PATH: ["CAKE", "WBNB"],
    },
    {
      WORKER_NAME: "YFI-WBNB PancakeswapWorker",
      REINVEST_BOUNTY_BPS: "900",
      REINVEST_THRESHOLD: "1",
      REINVEST_PATH: ["CAKE", "WBNB"],
    },
    {
      WORKER_NAME: "XVS-WBNB PancakeswapWorker",
      REINVEST_BOUNTY_BPS: "900",
      REINVEST_THRESHOLD: "1",
      REINVEST_PATH: ["CAKE", "WBNB"],
    },
    {
      WORKER_NAME: "LINK-WBNB PancakeswapWorker",
      REINVEST_BOUNTY_BPS: "900",
      REINVEST_THRESHOLD: "1",
      REINVEST_PATH: ["CAKE", "WBNB"],
    },
    {
      WORKER_NAME: "UNI-WBNB PancakeswapWorker",
      REINVEST_BOUNTY_BPS: "900",
      REINVEST_THRESHOLD: "1",
      REINVEST_PATH: ["CAKE", "WBNB"],
    },
    {
      WORKER_NAME: "DOT-WBNB PancakeswapWorker",
      REINVEST_BOUNTY_BPS: "900",
      REINVEST_THRESHOLD: "1",
      REINVEST_PATH: ["CAKE", "WBNB"],
    },
    {
      WORKER_NAME: "ETH-WBNB PancakeswapWorker",
      REINVEST_BOUNTY_BPS: "900",
      REINVEST_THRESHOLD: "1",
      REINVEST_PATH: ["CAKE", "WBNB"],
    },
    {
      WORKER_NAME: "BTCB-WBNB PancakeswapWorker",
      REINVEST_BOUNTY_BPS: "900",
      REINVEST_THRESHOLD: "1",
      REINVEST_PATH: ["CAKE", "WBNB"],
    },
    {
      WORKER_NAME: "CAKE-WBNB PancakeswapWorker",
      REINVEST_BOUNTY_BPS: "900",
      REINVEST_THRESHOLD: "1",
      REINVEST_PATH: ["CAKE", "WBNB"],
    },
  ];
  const EXACT_ETA = "1640242800";

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
  const reinvestConfigs: IWorkerReinvestConfigs = workerInputs.map((reinvestConfig) => {
    // 1. find each worker having an identical name as workerInput
    // 2. if hit return
    // 3. other wise throw error
    const hit = allWorkers.find((worker) => {
      return worker.WORKER_NAME === reinvestConfig.WORKER_NAME;
    });
    if (hit === undefined) throw new Error(`could not find ${reinvestConfig.WORKER_NAME}`);

    if (!reinvestConfig.WORKER_NAME.includes("CakeMaxiWorker") && !reinvestConfig.REINVEST_PATH)
      throw new Error(`${reinvestConfig.WORKER_NAME} must have a REINVEST_PATH`);

    const tokenList: any = config.Tokens;
    let reinvestPath: Array<string> = [];
    if (reinvestConfig.REINVEST_PATH) {
      reinvestPath = reinvestConfig.REINVEST_PATH.map((p) => {
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
      REINVEST_BOUNTY_BPS: reinvestConfig.REINVEST_BOUNTY_BPS,
      REINVEST_THRESHOLD: ethers.utils.parseEther(reinvestConfig.REINVEST_THRESHOLD).toString(),
      REINVEST_PATH: reinvestPath,
    };
  });

  const deployer = (await ethers.getSigners())[0];
  const timelockTransactions: Array<TimelockEntity.Transaction> = [];
  let nonce = await deployer.getTransactionCount();

  for (const reinvestConfig of reinvestConfigs) {
    if (reinvestConfig.WORKER_NAME.includes("CakeMaxiWorker")) {
      timelockTransactions.push(
        await TimelockService.queueTransaction(
          `setting reinvest params for ${reinvestConfig.WORKER_NAME}`,
          reinvestConfig.ADDRESS,
          "0",
          "setReinvestConfig(uint256,uint256)",
          ["uint256", "uint256"],
          [reinvestConfig.REINVEST_BOUNTY_BPS, reinvestConfig.REINVEST_THRESHOLD],
          EXACT_ETA,
          { nonce: nonce++ }
        )
      );
    } else {
      timelockTransactions.push(
        await TimelockService.queueTransaction(
          `setting reinvest params for ${reinvestConfig.WORKER_NAME}`,
          reinvestConfig.ADDRESS,
          "0",
          "setReinvestConfig(uint256,uint256,address[])",
          ["uint256", "uint256", "address[]"],
          [reinvestConfig.REINVEST_BOUNTY_BPS, reinvestConfig.REINVEST_THRESHOLD, reinvestConfig.REINVEST_PATH],
          EXACT_ETA,
          { nonce: nonce++ }
        )
      );
    }
  }

  fileService.writeJson(`${title}`, timelockTransactions);
};

export default func;
func.tags = ["TimelockSetReinvestConfigWorkers02"];
