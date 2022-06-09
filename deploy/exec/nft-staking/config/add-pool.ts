import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { getDeployer } from "../../../../utils/deployer-helper";
import { ConfigFileHelper } from "../../../helper";
import { NFTStaking__factory } from "../../../../typechain";

const Alpies = "0x57A7c5d10c3F87f5617Ac1C60DA60082E44D539e";
const AlpiesWormhole = "0x077dc15c7ef8107e77daad8139158d9391261d40";

interface AddPoolConfig {
  address: string;
  poolWeigth: number;
  minPeriod: number;
  maxPeriod: number;
}

const _buildInput = (address: string, poolWeigth: number, minPeriod: number, maxPeriod: number) => {
  return {
    address,
    poolWeigth,
    minPeriod,
    maxPeriod,
  };
};

const DAY_IN_SECONDS = 86400;

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

  const nftContractConfigsInput = [
    _buildInput(Alpies, 1000, 0, DAY_IN_SECONDS * 356),
    _buildInput(AlpiesWormhole, 1000, 0, DAY_IN_SECONDS * 356),
  ];

  const deployer = await getDeployer();
  const configFileHelper = new ConfigFileHelper();
  const config = configFileHelper.getConfig();

  console.log(">> Start Add Pool for NFTStaking");
  if (!config.NFT?.NFTStaking) throw Error("NFT contract address not found");
  const NFTStaking = NFTStaking__factory.connect(config.NFT.NFTStaking, deployer);

  for (const input of nftContractConfigsInput) {
    console.log(`>> Adding Pool NFTStaking contract [${input.address}]`);
    await NFTStaking.addPool(input.address, input.poolWeigth, input.minPeriod, input.maxPeriod);
    console.log("✅ Done");
  }
};

export default func;
func.tags = ["NFTStakingAddPool"];
