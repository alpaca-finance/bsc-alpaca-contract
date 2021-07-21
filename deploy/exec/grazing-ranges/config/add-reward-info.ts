import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';
import { ethers, network } from 'hardhat';
import { Timelock__factory } from '../../../../typechain'
import { ConfigEntity, TimelockEntity } from '../../../entities';
import { FileService, TimelockService } from '../../../services';

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
  const REWARDINFO: IAddGrazingRangeRewardInfoParamList = [{
    // 1,922,499.94 WEX
    PHASE_NAME: 'WEEK_1',
    CAMPAIGN_ID: '10',
    ENDBLOCK: '9523700',
    REWARD_PER_BLOCK: ethers.utils.parseEther('9.536210').toString()
  }, {
    // 1,922,499.94 WEX
    PHASE_NAME: 'WEEK_2',
    CAMPAIGN_ID: '10',
    ENDBLOCK: '9725300',
    REWARD_PER_BLOCK: ethers.utils.parseEther('9.536210').toString()
  }, {
    // 1,922,499.94 WEX
    PHASE_NAME: 'WEEK_3',
    CAMPAIGN_ID: '10',
    ENDBLOCK: '9926900',
    REWARD_PER_BLOCK: ethers.utils.parseEther('9.536210').toString()
  }, {
    // 1,922,499.94 WEX
    PHASE_NAME: 'WEEK_4',
    CAMPAIGN_ID: '10',
    ENDBLOCK: '10128500',
    REWARD_PER_BLOCK: ethers.utils.parseEther('9.536210').toString()
  }]
  const EXACT_ETA = '1626701400'
  









  const config = ConfigEntity.getConfig()
  const timelockTransactions: Array<TimelockEntity.Transaction> = []

  for(let i = 0; i < REWARDINFO.length; i++) {
    const rewardInfo = REWARDINFO[i]
    timelockTransactions.push(await TimelockService.queueTransaction(
      `add reward info for campaign#${rewardInfo.CAMPAIGN_ID} ${rewardInfo.PHASE_NAME}`,
      config.GrazingRange.address,
      '0',
      'addRewardInfo(uint256,uint256,uint256)',
      ['uint256', 'uint256', 'uint256'],
      [rewardInfo.CAMPAIGN_ID, rewardInfo.ENDBLOCK, rewardInfo.REWARD_PER_BLOCK],
      EXACT_ETA
    ))
  }

  await FileService.write('add-reward-info', timelockTransactions)
};

export default func;
func.tags = ['TimelockAddGrazingRangeRewardInfos'];