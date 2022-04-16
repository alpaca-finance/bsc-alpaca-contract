import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { ethers, network } from "hardhat";
import { Timelock__factory } from "../../../../typechain";
import { ConfigEntity, TimelockEntity } from "../../../entities";
import { fileService, TimelockService } from "../../../services";

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
      PHASE_NAME: "ETERNAL_WEEK_1",
      CAMPAIGN_ID: "36",
      ENDBLOCK: "13339900",
      REWARD_PER_BLOCK: ethers.utils.parseEther("0.00105").toString(),
    },
    {
      PHASE_NAME: "ETERNAL_WEEK_2",
      CAMPAIGN_ID: "36",
      ENDBLOCK: "13541500",
      REWARD_PER_BLOCK: ethers.utils.parseEther("0.00058").toString(),
    },
    {
      PHASE_NAME: "ETERNAL_WEEK_3",
      CAMPAIGN_ID: "36",
      ENDBLOCK: "13743100",
      REWARD_PER_BLOCK: ethers.utils.parseEther("0.00044").toString(),
    },
    {
      PHASE_NAME: "ETERNAL_WEEK_4",
      CAMPAIGN_ID: "36",
      ENDBLOCK: "13944700",
      REWARD_PER_BLOCK: ethers.utils.parseEther("0.00025").toString(),
    },
  ];
  const EXACT_ETA = "1638426600";

  const config = ConfigEntity.getConfig();
  const timelockTransactions: Array<TimelockEntity.Transaction> = [];

  for (let i = 0; i < REWARDINFO.length; i++) {
    const rewardInfo = REWARDINFO[i];
    timelockTransactions.push(
      await TimelockService.queueTransaction(
        `add reward info for campaign#${rewardInfo.CAMPAIGN_ID} ${rewardInfo.PHASE_NAME}`,
        config.GrazingRange!.address,
        "0",
        "addRewardInfo(uint256,uint256,uint256)",
        ["uint256", "uint256", "uint256"],
        [rewardInfo.CAMPAIGN_ID, rewardInfo.ENDBLOCK, rewardInfo.REWARD_PER_BLOCK],
        EXACT_ETA,
        { gasPrice: ethers.utils.parseUnits("10", "gwei") }
      )
    );
  }

  fileService.writeJson("add-reward-info", timelockTransactions);
};

export default func;
func.tags = ["TimelockAddGrazingRangeRewardInfos"];
