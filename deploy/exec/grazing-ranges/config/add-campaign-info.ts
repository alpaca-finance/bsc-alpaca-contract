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
      NAME: "ibALPACA-8_DECIMAL_PLACES",
      STAKING_TOKEN: "0x6ad3A0d891C59677fbbB22E071613253467C382A",
      REWARD_TOKEN: "0x0d126d63Eaf56647e6673EB204935557D21F6884",
      START_BLOCK: "13586000",
    },
    {
      NAME: "ibALPACA-20_DECIMAL_PLACES",
      STAKING_TOKEN: "0x6ad3A0d891C59677fbbB22E071613253467C382A",
      REWARD_TOKEN: "0x84e41755532c355766E4BA31513550Af8E1dAD34",
      START_BLOCK: "13586000",
    },
  ];
  const EXACT_ETA = "1635315300";

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
