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
      PHASE_NAME: "xWIN_WEEK_1",
      CAMPAIGN_ID: "27",
      ENDBLOCK: "12566100",
      REWARD_PER_BLOCK: ethers.utils.parseUnits("0.06383", 18).toString(),
    },
    {
      PHASE_NAME: "xWIN_WEEK_2",
      CAMPAIGN_ID: "27",
      ENDBLOCK: "12767700",
      REWARD_PER_BLOCK: ethers.utils.parseUnits("0.03546", 18).toString(),
    },
    {
      PHASE_NAME: "xWIN_WEEK_3",
      CAMPAIGN_ID: "27",
      ENDBLOCK: "12969300",
      REWARD_PER_BLOCK: ethers.utils.parseUnits("0.02695", 18).toString(),
    },
    {
      PHASE_NAME: "xWIN_WEEK_4",
      CAMPAIGN_ID: "27",
      ENDBLOCK: "13170900",
      REWARD_PER_BLOCK: ethers.utils.parseUnits("0.01560", 18).toString(),
    },
    {
      PHASE_NAME: "ARV_WEEK_1",
      CAMPAIGN_ID: "28",
      ENDBLOCK: "12566100",
      REWARD_PER_BLOCK: ethers.utils.parseUnits("446.42857", 8).toString(),
    },
    {
      PHASE_NAME: "ARV_WEEK_2",
      CAMPAIGN_ID: "28",
      ENDBLOCK: "12767700",
      REWARD_PER_BLOCK: ethers.utils.parseUnits("248.01587", 8).toString(),
    },
    {
      PHASE_NAME: "ARV_WEEK_3",
      CAMPAIGN_ID: "28",
      ENDBLOCK: "12969300",
      REWARD_PER_BLOCK: ethers.utils.parseUnits("188.49206", 8).toString(),
    },
    {
      PHASE_NAME: "ARV_WEEK_4",
      CAMPAIGN_ID: "28",
      ENDBLOCK: "13170900",
      REWARD_PER_BLOCK: ethers.utils.parseUnits("109.12698", 8).toString(),
    },
  ];
  const EXACT_ETA = "1636007400";

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
