import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { ethers, network } from "hardhat";
import { SpookyWorker03__factory } from "./../../../../typechain/factories/SpookyWorker03__factory";
import { TombWorker03__factory } from "./../../../../typechain/factories/TombWorker03__factory";
import { fileService, TimelockService } from "../../../services";
import { ConfigEntity, TimelockEntity } from "../../../entities";
import { getDeployer } from "../../../../utils/deployer-helper";

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
  const workerInputs: IWorkerReinvestConfigInputs = [
    {
      WORKER_NAME: "WFTM-ALPACA SpookyWorker",
      REINVEST_BOUNTY_BPS: "900",
      REINVEST_THRESHOLD: "33",
      REINVEST_PATH: ["BOO", "WFTM", "ALPACA"],
    },
    {
      WORKER_NAME: "TUSD-USDC SpookyWorker",
      REINVEST_BOUNTY_BPS: "900",
      REINVEST_THRESHOLD: "33",
      REINVEST_PATH: ["BOO", "WFTM", "USDC"],
    },
    {
      WORKER_NAME: "WFTM-USDC SpookyWorker",
      REINVEST_BOUNTY_BPS: "900",
      REINVEST_THRESHOLD: "33",
      REINVEST_PATH: ["BOO", "WFTM", "USDC"],
    },
    {
      WORKER_NAME: "MIM-WFTM SpookyWorker",
      REINVEST_BOUNTY_BPS: "900",
      REINVEST_THRESHOLD: "33",
      REINVEST_PATH: ["BOO", "WFTM"],
    },
    {
      WORKER_NAME: "DAI-WFTM SpookyWorker",
      REINVEST_BOUNTY_BPS: "900",
      REINVEST_THRESHOLD: "33",
      REINVEST_PATH: ["BOO", "WFTM"],
    },
    {
      WORKER_NAME: "fUSDT-WFTM SpookyWorker",
      REINVEST_BOUNTY_BPS: "900",
      REINVEST_THRESHOLD: "33",
      REINVEST_PATH: ["BOO", "WFTM"],
    },
    {
      WORKER_NAME: "BTC-WFTM SpookyWorker",
      REINVEST_BOUNTY_BPS: "900",
      REINVEST_THRESHOLD: "33",
      REINVEST_PATH: ["BOO", "WFTM"],
    },
    {
      WORKER_NAME: "ALPACA-WFTM SpookyWorker",
      REINVEST_BOUNTY_BPS: "900",
      REINVEST_THRESHOLD: "33",
      REINVEST_PATH: ["BOO", "WFTM"],
    },
    {
      WORKER_NAME: "ETH-WFTM SpookyWorker",
      REINVEST_BOUNTY_BPS: "900",
      REINVEST_THRESHOLD: "33",
      REINVEST_PATH: ["BOO", "WFTM"],
    },
    {
      WORKER_NAME: "BOO-WFTM SpookyWorker",
      REINVEST_BOUNTY_BPS: "900",
      REINVEST_THRESHOLD: "33",
      REINVEST_PATH: ["BOO", "WFTM"],
    },
    {
      WORKER_NAME: "USDC-WFTM SpookyWorker",
      REINVEST_BOUNTY_BPS: "900",
      REINVEST_THRESHOLD: "33",
      REINVEST_PATH: ["BOO", "WFTM"],
    },
    {
      WORKER_NAME: "WFTM-TOMB TombWorker",
      REINVEST_BOUNTY_BPS: "900",
      REINVEST_THRESHOLD: "33",
      REINVEST_PATH: ["TSHARE", "WFTM", "TOMB"],
    },
    {
      WORKER_NAME: "TSHARE-WFTM TombWorker",
      REINVEST_BOUNTY_BPS: "900",
      REINVEST_THRESHOLD: "33",
      REINVEST_PATH: ["TSHARE", "WFTM"],
    },
    {
      WORKER_NAME: "TOMB-WFTM TombWorker",
      REINVEST_BOUNTY_BPS: "900",
      REINVEST_THRESHOLD: "33",
      REINVEST_PATH: ["TSHARE", "WFTM"],
    },
  ];

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

  const deployer = await getDeployer();
  let nonce = await deployer.getTransactionCount();

  for (const reinvestConfig of reinvestConfigs) {
    console.log(`>> Set reinvest config for ${reinvestConfig.WORKER_NAME}`);
    if (reinvestConfig.WORKER_NAME.includes("TombWorker")) {
      const tombWorker03 = TombWorker03__factory.connect(reinvestConfig.ADDRESS, deployer);
      await tombWorker03.setReinvestConfig(
        reinvestConfig.REINVEST_BOUNTY_BPS,
        reinvestConfig.REINVEST_THRESHOLD,
        reinvestConfig.REINVEST_PATH,
        {
          nonce: nonce++,
          gasPrice: ethers.utils.parseUnits("10", "gwei"),
        }
      );
      console.log("✅ Done");
      continue;
    }
    const spookyWorker03 = SpookyWorker03__factory.connect(reinvestConfig.ADDRESS, deployer);
    await spookyWorker03.setReinvestConfig(
      reinvestConfig.REINVEST_BOUNTY_BPS,
      reinvestConfig.REINVEST_THRESHOLD,
      reinvestConfig.REINVEST_PATH,
      {
        nonce: nonce++,
        gasPrice: ethers.utils.parseUnits("10", "gwei"),
      }
    );
    console.log("✅ Done");
  }
};

export default func;
func.tags = ["SetReinvestConfigWorkers03"];
