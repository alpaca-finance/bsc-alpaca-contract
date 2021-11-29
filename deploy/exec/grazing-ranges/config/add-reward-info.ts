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
      PHASE_NAME: "SPS_WEEK_1",
      CAMPAIGN_ID: "34",
      ENDBLOCK: "13147200",
      REWARD_PER_BLOCK: ethers.utils.parseEther("0.72544").toString(),
    },
    {
      PHASE_NAME: "SPS_WEEK_2",
      CAMPAIGN_ID: "34",
      ENDBLOCK: "13348800",
      REWARD_PER_BLOCK: ethers.utils.parseEther("0.40302").toString(),
    },
    {
      PHASE_NAME: "SPS_WEEK_3",
      CAMPAIGN_ID: "34",
      ENDBLOCK: "13550400",
      REWARD_PER_BLOCK: ethers.utils.parseEther("0.30629").toString(),
    },
    {
      PHASE_NAME: "SPS_WEEK_4",
      CAMPAIGN_ID: "34",
      ENDBLOCK: "13752000",
      REWARD_PER_BLOCK: ethers.utils.parseEther("0.17733").toString(),
    },
    {
      PHASE_NAME: "SPS_WEEK_5",
      CAMPAIGN_ID: "34",
      ENDBLOCK: "13953600",
      REWARD_PER_BLOCK: ethers.utils.parseEther("0.17705").toString(),
    },
    {
      PHASE_NAME: "SPS_WEEK_6",
      CAMPAIGN_ID: "34",
      ENDBLOCK: "14155200",
      REWARD_PER_BLOCK: ethers.utils.parseEther("0.17705").toString(),
    },
    {
      PHASE_NAME: "SPS_WEEK_7",
      CAMPAIGN_ID: "34",
      ENDBLOCK: "14356800",
      REWARD_PER_BLOCK: ethers.utils.parseEther("0.17705").toString(),
    },
    {
      PHASE_NAME: "SPS_WEEK_8",
      CAMPAIGN_ID: "34",
      ENDBLOCK: "14558400",
      REWARD_PER_BLOCK: ethers.utils.parseEther("0.17705").toString(),
    },
  ];
  const EXACT_ETA = "1637811000";

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
