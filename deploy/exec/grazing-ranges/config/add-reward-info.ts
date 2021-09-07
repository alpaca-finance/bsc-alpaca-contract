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
      PHASE_NAME: "ALM_WEEK_1",
      CAMPAIGN_ID: "13",
      ENDBLOCK: "10968600",
      REWARD_PER_BLOCK: ethers.utils.parseEther("1.86899").toString(),
    },
    {
      PHASE_NAME: "ALM_WEEK_2",
      CAMPAIGN_ID: "13",
      ENDBLOCK: "11170200",
      REWARD_PER_BLOCK: ethers.utils.parseEther("1.03833").toString(),
    },
    {
      PHASE_NAME: "ALM_WEEK_3",
      CAMPAIGN_ID: "13",
      ENDBLOCK: "11371800",
      REWARD_PER_BLOCK: ethers.utils.parseEther("0.78913").toString(),
    },
    {
      PHASE_NAME: "ALM_WEEK_4",
      CAMPAIGN_ID: "13",
      ENDBLOCK: "11573400",
      REWARD_PER_BLOCK: ethers.utils.parseEther("0.45686").toString(),
    },
    {
      PHASE_NAME: "KALA_WEEK_1",
      CAMPAIGN_ID: "14",
      ENDBLOCK: "10968600",
      REWARD_PER_BLOCK: ethers.utils.parseEther("0.62779").toString(),
    },
    {
      PHASE_NAME: "KALA_WEEK_2",
      CAMPAIGN_ID: "14",
      ENDBLOCK: "11170200",
      REWARD_PER_BLOCK: ethers.utils.parseEther("0.34877").toString(),
    },
    {
      PHASE_NAME: "KALA_WEEK_3",
      CAMPAIGN_ID: "14",
      ENDBLOCK: "11371800",
      REWARD_PER_BLOCK: ethers.utils.parseEther("0.26506").toString(),
    },
    {
      PHASE_NAME: "KALA_WEEK_4",
      CAMPAIGN_ID: "14",
      ENDBLOCK: "11573400",
      REWARD_PER_BLOCK: ethers.utils.parseEther("0.15345").toString(),
    },
  ];
  const EXACT_ETA = "1631082600";

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

  await FileService.write("add-reward-info", timelockTransactions);
};

export default func;
func.tags = ["TimelockAddGrazingRangeRewardInfos"];
