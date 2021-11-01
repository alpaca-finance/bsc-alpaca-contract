import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { ethers, network } from "hardhat";
import { Timelock__factory } from "../../../../typechain";
import { ConfigEntity, TimelockEntity } from "../../../entities";
import { FileService, TimelockService } from "../../../services";

interface IAddGrazingRangeRewardInfoParam {
  PHASE_NAME: string;
  CAMPAIGN_ID: string;
  ENDBLOCK: string;
  REWARD_PER_BLOCK: string;
}

type IAddGrazingRangeRewardInfoParamList = Array<IAddGrazingRangeRewardInfoParam>;

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
  const REWARDINFO: IAddGrazingRangeRewardInfoParamList = [
    {
      PHASE_NAME: "8_DECIMALS_WEEK_1",
      CAMPAIGN_ID: "4",
      ENDBLOCK: "13587000",
      REWARD_PER_BLOCK: ethers.utils.parseUnits("1", 8).toString(),
    },
    {
      PHASE_NAME: "8_DECIMALS_WEEK_2",
      CAMPAIGN_ID: "4",
      ENDBLOCK: "13588000",
      REWARD_PER_BLOCK: ethers.utils.parseUnits("2", 8).toString(),
    },
    {
      PHASE_NAME: "8_DECIMALS_WEEK_3",
      CAMPAIGN_ID: "4",
      ENDBLOCK: "13589000",
      REWARD_PER_BLOCK: ethers.utils.parseUnits("3", 8).toString(),
    },
    {
      PHASE_NAME: "8_DECIMALS_WEEK_4",
      CAMPAIGN_ID: "4",
      ENDBLOCK: "13590000",
      REWARD_PER_BLOCK: ethers.utils.parseUnits("4", 8).toString(),
    },
    {
      PHASE_NAME: "20_DECIMALS_WEEK_1",
      CAMPAIGN_ID: "5",
      ENDBLOCK: "13587000",
      REWARD_PER_BLOCK: ethers.utils.parseUnits("1", 20).toString(),
    },
    {
      PHASE_NAME: "20_DECIMALS_WEEK_2",
      CAMPAIGN_ID: "5",
      ENDBLOCK: "13588000",
      REWARD_PER_BLOCK: ethers.utils.parseUnits("2", 20).toString(),
    },
    {
      PHASE_NAME: "20_DECIMALS_WEEK_3",
      CAMPAIGN_ID: "5",
      ENDBLOCK: "13589000",
      REWARD_PER_BLOCK: ethers.utils.parseUnits("3", 20).toString(),
    },
    {
      PHASE_NAME: "20_DECIMALS_WEEK_4",
      CAMPAIGN_ID: "5",
      ENDBLOCK: "13590000",
      REWARD_PER_BLOCK: ethers.utils.parseUnits("4", 20).toString(),
    },
  ];
  const EXACT_ETA = "1635315300";

  const config = ConfigEntity.getConfig();
  const timelockTransactions: Array<TimelockEntity.Transaction> = [];

  for (let i = 0; i < REWARDINFO.length; i++) {
    const rewardInfo = REWARDINFO[i];
    timelockTransactions.push(
      await TimelockService.queueTransaction(
        `add reward info for campaign#${rewardInfo.CAMPAIGN_ID} ${rewardInfo.PHASE_NAME}`,
        config.GrazingRange.address,
        "0",
        "addRewardInfo(uint256,uint256,uint256)",
        ["uint256", "uint256", "uint256"],
        [rewardInfo.CAMPAIGN_ID, rewardInfo.ENDBLOCK, rewardInfo.REWARD_PER_BLOCK],
        EXACT_ETA
      )
    );
  }

  FileService.write("add-reward-info", timelockTransactions);
};

export default func;
func.tags = ["TimelockAddGrazingRangeRewardInfos"];
