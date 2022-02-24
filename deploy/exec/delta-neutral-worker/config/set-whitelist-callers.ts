import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { ethers } from "hardhat";
import { DeltaNeutralMdexWorker02__factory, DeltaNeutralPancakeWorker02__factory } from "../../../../typechain";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";

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
  interface IWorkerInput {
    name: string;
    address: string;
  }

  const DELTA_NEUTRAL_VAULT_ADDRESS = "";
  const workerInputs: IWorkerInput[] = [
    {
      name: "WBNB-BUSD DeltaNeutralPancakeswapWorker",
      address: "",
    },
    {
      name: "BUSD-WBNB DeltaNeutralPancakeswapWorker",
      address: "",
    },
  ];

  const deployer = (await ethers.getSigners())[0];

  for (let i = 0; i < workerInputs.length; i++) {
    console.log("===================================================================================");
    console.log(`>> Setting up whitelist callers for ${workerInputs[i].name}`);
    if (workerInputs[i].name.includes("Mdex")) {
      console.log(">> Setting up whitelist callers for DeltaNeutralMdexWorker");
      const deltaWorker = DeltaNeutralMdexWorker02__factory.connect(workerInputs[i].address, deployer);
      await deltaWorker.setWhitelistedCallers([DELTA_NEUTRAL_VAULT_ADDRESS], true);
      console.log("✅ Done");
      continue;
    }
    console.log(">> Setting up whitelist callers for DeltaNeutralPancakeWorker");
    const deltaWorker = DeltaNeutralPancakeWorker02__factory.connect(workerInputs[i].address, deployer);
    await deltaWorker.setWhitelistedCallers([DELTA_NEUTRAL_VAULT_ADDRESS], true);
    console.log("✅ Done");
  }
};

export default func;
func.tags = ["DeltaNeutralWorkerSetWhitelistCallers"];
