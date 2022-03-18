import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { ethers } from "hardhat";
import { DeltaNeutralMdexWorker02__factory, DeltaNeutralPancakeWorker02__factory } from "../../../../typechain";
import { getConfig } from "../../../entities/config";

interface IWorkerInput {
  name: string;
}

interface IWorkerInfo {
  name: string;
  address: string;
}

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
  const config = getConfig();
  const DELTA_NEUTRAL_VAULT = "Market Neutral 8x BNB-USDT PCS1";
  const workerInputs: IWorkerInput[] = [
    {
      name: "WBNB-USDT 8x DeltaNeutralPancakeswapWorker",
    },
    {
      name: "USDT-WBNB 8x DeltaNeutralPancakeswapWorker",
    },
  ];

  const deployer = (await ethers.getSigners())[0];
  let nonce = await deployer.getTransactionCount();

  const allWorkers: Array<IWorkerInfo> = config.Vaults.reduce((accum, vault) => {
    return accum.concat(
      vault.workers.map((worker) => {
        return {
          name: worker.name,
          address: worker.address,
        };
      })
    );
  }, [] as Array<IWorkerInfo>);
  const workerInfos: Array<IWorkerInfo> = workerInputs.map((workerInput) => {
    const hit = allWorkers.find((worker) => {
      return worker.name === workerInput.name;
    });

    if (!!hit) return hit;

    throw new Error(`could not find ${workerInput}`);
  });
  const deltaNeutralVault = config.DeltaNeutralVaults.find((deltaVault) => deltaVault.name === DELTA_NEUTRAL_VAULT);
  if (!deltaNeutralVault) throw new Error(`could not find ${DELTA_NEUTRAL_VAULT}`);

  for (let i = 0; i < workerInfos.length; i++) {
    console.log("===================================================================================");
    console.log(`>> Setting up whitelist callers for ${workerInfos[i].name}`);
    const deltaWorker = DeltaNeutralPancakeWorker02__factory.connect(workerInfos[i].address, deployer);
    await deltaWorker.setWhitelistedCallers([deltaNeutralVault.address], true, { nonce: nonce++ });
    console.log("✅ Done");
  }
};

export default func;
func.tags = ["DeltaNeutralWorkerSetWhitelistCallers"];
