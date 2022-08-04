import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { ethers } from "hardhat";
import { Timelock__factory } from "../../../../typechain";
import { getDeployer, isFork } from "../../../../utils/deployer-helper";
import { TimelockEntity } from "../../../entities";
import { fileService, TimelockService } from "../../../services";

interface ISetWhitelistedStratWorkers {
  STRAT_NAME: string;
  STRAT_ADDR: string;
  WORKERS: Array<string>;
}

type ISetWhitelistedStratsWorkers = Array<ISetWhitelistedStratWorkers>;

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
  const WHITELISTED_STRATS_WORKERS: ISetWhitelistedStratsWorkers = [
    {
      STRAT_NAME: "RepurchaseBorrowStrategy",
      STRAT_ADDR: "0xdDf2715911ae70a2E7ef42ea8BD86D1c2c319F5e",
      WORKERS: ["0xdDf2715911ae70a2E7ef42ea8BD86D1c2c319F5e", "0x40D23cD168F46E5B8302C690E6EA54D6dbf279D6"],
    },
    {
      STRAT_NAME: "RepurchaseRepayStrategy",
      STRAT_ADDR: "0x40D23cD168F46E5B8302C690E6EA54D6dbf279D6",
      WORKERS: ["0xdDf2715911ae70a2E7ef42ea8BD86D1c2c319F5e", "0x40D23cD168F46E5B8302C690E6EA54D6dbf279D6"],
    },
  ];

  const TIMELOCK = "0x2D5408f2287BF9F9B05404794459a846651D0a59";
  const EXACT_ETA = "1667464150";
  const TITLE = `${EXACT_ETA}_strat_setWorkersOk`;

  const deployer = await getDeployer();
  let nonce = await deployer.getTransactionCount();
  const timelockTransactions: Array<TimelockEntity.Transaction> = [];

  for (let i = 0; i < WHITELISTED_STRATS_WORKERS.length; i++) {
    const params = WHITELISTED_STRATS_WORKERS[i];
    const ops = isFork() ? { nonce: nonce++, gasLimit: 2000000 } : { nonce: nonce++ };
    console.log(
      `>> Timelock: adding ${JSON.stringify(params.WORKERS)} as a whitelisted workers of: "${
        params.STRAT_NAME
      }" via Timelock`
    );
    timelockTransactions.push(
      await TimelockService.queueTransaction(
        `setWorkersOk for ${params.STRAT_NAME}`,
        params.STRAT_ADDR,
        "0",
        "setWorkersOk(address[],bool)",
        ["address[]", "bool"],
        [params.WORKERS, true],
        EXACT_ETA,
        ops
      )
    );
    const worker_addresses = params.WORKERS.map((worker) => `'${worker}'`);
    console.log("generate timelock.executeTransaction:");
    console.log(
      `await timelock.executeTransaction('${params.STRAT_ADDR}', '0', 'setWorkersOk(address[],bool)', ethers.utils.defaultAbiCoder.encode(['address[]','bool'],[[${worker_addresses}], true]), ${EXACT_ETA})`
    );
    console.log("✅ Done");

    fileService.writeJson(TITLE, timelockTransactions);
  }
};

export default func;
func.tags = ["TimelockSetSharedStratsWhitelistedWorkers"];
