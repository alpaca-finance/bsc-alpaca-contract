import { WorkerReader__factory } from "../../../../typechain/factories/WorkerReader__factory";
import { ethers } from "hardhat";
import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { getDeployer, isFork } from "../../../../utils/deployer-helper";

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

  const masterChefs: string[] = [
    "0xa5f8C5Dbd5F286960b9d90548680aE5ebFf07652",
    "0xDbc1A13490deeF9c3C12b44FE77b503c1B061739",
    "0xc48FE252Aa631017dF253578B1405ea399728A50",
  ];
  const rewardTokens: string[] = [
    "0x0e09fabb73bd3ade0a17ecc321fd13a19e81ce82",
    "0x965F527D9159dCe6288a2219DB51fc6Eef120dD1",
    "0x9C65AB58d8d978DB963e63f2bfB7121627e3a739",
  ];
  const chainLinkAggregators: string[] = [
    "0xB6064eD41d4f67e353768aA239cA86f4F73665a1",
    "0x08E70777b982a58D23D05E3D7714f44837c06A21",
    "0x9165366bf450a6906D25549f0E0f8E6586Fc93E2",
  ];

  const deployer = await getDeployer();

  console.log(">> Deploying an WorkerReader contract");

  const ops = isFork() ? { gasLimit: 2000000 } : {};

  const WorkerReader = (await ethers.getContractFactory("WorkerReader", deployer)) as WorkerReader__factory;

  const workerReader = await WorkerReader.deploy(masterChefs, rewardTokens, chainLinkAggregators, ops);

  await workerReader.deployTransaction.wait(3);

  console.log(`>> Deployed at ${workerReader.address}`);
  console.log("✅ Done");
};

export default func;
func.tags = ["WorkerReader"];
