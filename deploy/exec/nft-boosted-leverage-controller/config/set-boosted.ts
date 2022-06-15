import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { getDeployer } from "../../../../utils/deployer-helper";
import { ConfigFileHelper } from "../../../helper";
import { NFTBoostedLeverageController__factory } from "../../../../typechain";

const Alpies = "0x57A7c5d10c3F87f5617Ac1C60DA60082E44D539e";
const AlpiesWormhole = "0x077dc15c7ef8107e77daad8139158d9391261d40";

interface BoostedConfig {
  workerAddress: string;
  nftAddress: string;
  workFactor: number;
  killFactor: number;
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

  const boostedConfigs: BoostedConfig[] = [
    {
      workerAddress: "0x5EffBF90F915B59cc967060740243037CE9E6a7E",
      nftAddress: Alpies,
      workFactor: 7000,
      killFactor: 520,
    },
    {
      workerAddress: "0x5EffBF90F915B59cc967060740243037CE9E6a7E",
      nftAddress: AlpiesWormhole,
      workFactor: 7900,
      killFactor: 350,
    },
  ];

  const deployer = await getDeployer();
  const configFileHelper = new ConfigFileHelper();
  const config = configFileHelper.getConfig();

  console.log(">> Start Set Boosted for NFTBoostedLeverageController");
  if (!config.NFT?.NFTBoostedLeverageController) throw Error("NFTBoostedLeverageController address not found");

  const NFTBoostedLeverageController = NFTBoostedLeverageController__factory.connect(
    config.NFT.NFTBoostedLeverageController,
    deployer
  );

  await NFTBoostedLeverageController.setBoosted(
    boostedConfigs.map((b) => b.nftAddress),
    boostedConfigs.map((b) => b.workerAddress),
    boostedConfigs.map((b) => b.workFactor),
    boostedConfigs.map((b) => b.killFactor)
  );

  console.log("✅ Done");

  console.table(boostedConfigs);
};

export default func;
func.tags = ["NFTBoostedLeverageControllerSetBoosted"];
