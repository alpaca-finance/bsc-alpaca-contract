import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { DeltaNeutralSpookyWorker03__factory } from "../../../../typechain";
import { getConfig } from "../../../entities/config";
import { getDeployer } from "../../../../utils/deployer-helper";

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
  const DELTA_NEUTRAL_VAULT = "Market Neutral 3x BNB-USDT BS1";
  const workerInputs: IWorkerInput[] = [
    {
      name: "WBNB-USDT 3x BS1 DeltaNeutralBiswapWorker",
    },
    {
      name: "USDT-WBNB 3x BS1 DeltaNeutralBiswapWorker",
    },
  ];

  const deployer = await getDeployer();
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

    throw new Error(`could not find ${workerInput.name}`);
  });
  const deltaNeutralVault = config.DeltaNeutralVaults.find((deltaVault) => deltaVault.name === DELTA_NEUTRAL_VAULT);
  if (!deltaNeutralVault) throw new Error(`could not find ${DELTA_NEUTRAL_VAULT}`);

  for (let i = 0; i < workerInfos.length; i++) {
    console.log("===================================================================================");
    console.log(`>> Setting up whitelist callers for ${workerInfos[i].name}`);
    const deltaWorker = DeltaNeutralSpookyWorker03__factory.connect(workerInfos[i].address, deployer);
    await deltaWorker.setWhitelistedCallers([deltaNeutralVault.address], true, { nonce: nonce++ });
    console.log("✅ Done");
  }
};

export default func;
func.tags = ["DeltaNeutralWorkerSetWhitelistCallers"];
