import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';
import { ethers } from 'hardhat';
import { Timelock__factory } from '../typechain'

interface IAddGrazingRangeRewardInfoParam {
    PHASE_NAME: string
    CAMPAIGN_ID: string
    ENDBLOCK: string
    REWARD_PER_BLOCK: string
}

type IAddGrazingRangeRewardInfoParamList = Array<IAddGrazingRangeRewardInfoParam>

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
  const TIMELOCK = '0x2D5408f2287BF9F9B05404794459a846651D0a59';
  const GRAZING_RANGE = '0x6bf5b334409cC3FD336Da9A2D3e3F9c870fEb343'
  const EXACT_ETA = '1620624600';
  const REWARDINFO: IAddGrazingRangeRewardInfoParamList = [{
    // 1,273.999104 BELT
    PHASE_NAME: 'WEEK_1',
    CAMPAIGN_ID: '1',
    ENDBLOCK: '7501600',
    REWARD_PER_BLOCK: ethers.utils.parseEther('0.00631944').toString()
  }, {
    // 707.99997736 BELT
    PHASE_NAME: 'WEEK_2',
    CAMPAIGN_ID: '1',
    ENDBLOCK: '7703200',
    REWARD_PER_BLOCK: ethers.utils.parseEther('0.00351190476').toString()
  }, {
    // 537.99984 BELT
    PHASE_NAME: 'WEEK_3',
    CAMPAIGN_ID: '1',
    ENDBLOCK: '7904800',
    REWARD_PER_BLOCK: ethers.utils.parseEther('0.00266865').toString()
  }, {
    // 310.999828 BELT
    PHASE_NAME: 'WEEK_4',
    CAMPAIGN_ID: '1',
    ENDBLOCK: '8106400',
    REWARD_PER_BLOCK: ethers.utils.parseEther('0.001542658').toString()
  }]
  











  const timelock = Timelock__factory.connect(TIMELOCK, (await ethers.getSigners())[0]);

  for(let i = 0; i < REWARDINFO.length; i++) {
    const rewardInfo = REWARDINFO[i]
    console.log(`>> Timelock: Adding a grazing range's reward info: "${rewardInfo.PHASE_NAME}" via Timelock`);
    await timelock.queueTransaction(
        GRAZING_RANGE, '0',
        'addRewardInfo(uint256,uint256,uint256)',
        ethers.utils.defaultAbiCoder.encode(
            ['uint256', 'uint256', 'uint256'],
            [
                rewardInfo.CAMPAIGN_ID,
                rewardInfo.ENDBLOCK,
                rewardInfo.REWARD_PER_BLOCK,
            ]
        ), EXACT_ETA
    );
    console.log("generate timelock.executeTransaction:")
    console.log(`await timelock.executeTransaction('${GRAZING_RANGE}', '0', 'addRewardInfo(uint256,uint256,uint256)', ethers.utils.defaultAbiCoder.encode(['uint256', 'uint256', 'uint256'],['${rewardInfo.CAMPAIGN_ID}','${rewardInfo.ENDBLOCK}','${rewardInfo.REWARD_PER_BLOCK}']), ${EXACT_ETA})`)
    console.log("✅ Done");
  }
};

export default func;
func.tags = ['TimelockAddGrazingRangeRewardInfos'];