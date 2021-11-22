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
      PHASE_NAME: "DEP_WEEK_1",
      CAMPAIGN_ID: "31",
      ENDBLOCK: "12954200",
      REWARD_PER_BLOCK: ethers.utils.parseEther("13.83928").toString(),
    },
    {
      PHASE_NAME: "DEP_WEEK_2",
      CAMPAIGN_ID: "31",
      ENDBLOCK: "13155800",
      REWARD_PER_BLOCK: ethers.utils.parseEther("7.68849").toString(),
    },
    {
      PHASE_NAME: "DEP_WEEK_3",
      CAMPAIGN_ID: "31",
      ENDBLOCK: "13357400",
      REWARD_PER_BLOCK: ethers.utils.parseEther("5.84325").toString(),
    },
    {
      PHASE_NAME: "DEP_WEEK_4",
      CAMPAIGN_ID: "31",
      ENDBLOCK: "13559000",
      REWARD_PER_BLOCK: ethers.utils.parseEther("3.38293").toString(),
    },
    {
      PHASE_NAME: "TEN_WEEK_1",
      CAMPAIGN_ID: "32",
      ENDBLOCK: "12954200",
      REWARD_PER_BLOCK: ethers.utils.parseEther("1.89732").toString(),
    },
    {
      PHASE_NAME: "TEN_WEEK_2",
      CAMPAIGN_ID: "32",
      ENDBLOCK: "13155800",
      REWARD_PER_BLOCK: ethers.utils.parseEther("1.05406").toString(),
    },
    {
      PHASE_NAME: "TEN_WEEK_3",
      CAMPAIGN_ID: "32",
      ENDBLOCK: "13357400",
      REWARD_PER_BLOCK: ethers.utils.parseEther("0.80109").toString(),
    },
    {
      PHASE_NAME: "TEN_WEEK_4",
      CAMPAIGN_ID: "32",
      ENDBLOCK: "13559000",
      REWARD_PER_BLOCK: ethers.utils.parseEther("0.46378").toString(),
    },
  ];
  const EXACT_ETA = "1637222400";

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
