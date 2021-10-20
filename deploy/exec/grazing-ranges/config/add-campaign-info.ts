import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { ConfigEntity, TimelockEntity } from "../../../entities";
import { FileService, TimelockService } from "../../../services";

interface IAddGrazingRangeCampaignParam {
  NAME: string;
  STAKING_TOKEN: string;
  REWARD_TOKEN: string;
  START_BLOCK: string;
}

type IAddGrazingRangeCampaignParamList = Array<IAddGrazingRangeCampaignParam>;

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
  const CAMPAIGNS: IAddGrazingRangeCampaignParamList = [
    {
      NAME: "ibALPACA-POLAR",
      STAKING_TOKEN: "0xf1bE8ecC990cBcb90e166b71E368299f0116d421",
      REWARD_TOKEN: "0xC64c9B30C981fc2eE4e13d0CA3f08258e725fd24",
      START_BLOCK: "11910600",
    },
    {
      NAME: "ibALPACA-MONI",
      STAKING_TOKEN: "0xf1bE8ecC990cBcb90e166b71E368299f0116d421",
      REWARD_TOKEN: "0x9573c88aE3e37508f87649f87c4dd5373C9F31e0",
      START_BLOCK: "11910600",
    },
  ];
  const EXACT_ETA = "1634621400";

  const config = ConfigEntity.getConfig();
  const timelockTransactions: Array<TimelockEntity.Transaction> = [];

  for (let i = 0; i < CAMPAIGNS.length; i++) {
    const campaign = CAMPAIGNS[i];
    timelockTransactions.push(
      await TimelockService.queueTransaction(
        `add ${campaign.NAME} to Grazing Range`,
        config.GrazingRange.address,
        "0",
        "addCampaignInfo(address,address,uint256)",
        ["address", "address", "uint256"],
        [campaign.STAKING_TOKEN, campaign.REWARD_TOKEN, campaign.START_BLOCK],
        EXACT_ETA
      )
    );
  }

  FileService.write("add-gr-campaign-info", timelockTransactions);
};

export default func;
func.tags = ["TimelockAddGrazingRangeCampaigns"];
