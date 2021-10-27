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
      PHASE_NAME: "SHEESHA_WEEK_1",
      CAMPAIGN_ID: "24",
      ENDBLOCK: "12311600",
      REWARD_PER_BLOCK: ethers.utils.parseEther("0.00145").toString(),
    },
    {
      PHASE_NAME: "SHEESHA_WEEK_2",
      CAMPAIGN_ID: "24",
      ENDBLOCK: "12513200",
      REWARD_PER_BLOCK: ethers.utils.parseEther("0.00080").toString(),
    },
    {
      PHASE_NAME: "SHEESHA_WEEK_3",
      CAMPAIGN_ID: "24",
      ENDBLOCK: "12714800",
      REWARD_PER_BLOCK: ethers.utils.parseEther("0.00061").toString(),
    },
    {
      PHASE_NAME: "SHEESHA_WEEK_4",
      CAMPAIGN_ID: "24",
      ENDBLOCK: "12916400",
      REWARD_PER_BLOCK: ethers.utils.parseEther("0.00035").toString(),
    },
    {
      PHASE_NAME: "NFTY_WEEK_1",
      CAMPAIGN_ID: "25",
      ENDBLOCK: "12311600",
      REWARD_PER_BLOCK: ethers.utils.parseEther("12.47767").toString(),
    },
    {
      PHASE_NAME: "NFTY_WEEK_2",
      CAMPAIGN_ID: "25",
      ENDBLOCK: "12513200",
      REWARD_PER_BLOCK: ethers.utils.parseEther("6.93204").toString(),
    },
    {
      PHASE_NAME: "NFTY_WEEK_3",
      CAMPAIGN_ID: "25",
      ENDBLOCK: "12714800",
      REWARD_PER_BLOCK: ethers.utils.parseEther("5.26835").toString(),
    },
    {
      PHASE_NAME: "NFTY_WEEK_4",
      CAMPAIGN_ID: "25",
      ENDBLOCK: "12916400",
      REWARD_PER_BLOCK: ethers.utils.parseEther("3.05009").toString(),
    },
  ];
  const EXACT_ETA = "1635229800";

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
