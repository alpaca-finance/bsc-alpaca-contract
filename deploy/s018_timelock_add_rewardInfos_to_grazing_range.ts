import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';
import { ethers, network } from 'hardhat';
import { Timelock__factory } from '../typechain'
import MainnetConfig from '../.mainnet.json'
import TestnetConfig from '../.testnet.json'

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
    // ✅ 735,848.064 ORBS
    PHASE_NAME: 'WEEK_1',
    CAMPAIGN_ID: '9',
    ENDBLOCK: '9322300',
    REWARD_PER_BLOCK: ethers.utils.parseEther('3.650040').toString()
  }, {
    // ✅ 408,804.48 ORBS
    PHASE_NAME: 'WEEK_2',
    CAMPAIGN_ID: '9',
    ENDBLOCK: '9523900',
    REWARD_PER_BLOCK: ethers.utils.parseEther('2.027800').toString()
  }, {
    // ✅ 310,689.792 ORBS
    PHASE_NAME: 'WEEK_3',
    CAMPAIGN_ID: '9',
    ENDBLOCK: '9725500',
    REWARD_PER_BLOCK: ethers.utils.parseEther('1.541120').toString()
  }, {
    // ✅ 179,873.568 ORBS
    PHASE_NAME: 'WEEK_4',
    CAMPAIGN_ID: '9',
    ENDBLOCK: '9927100',
    REWARD_PER_BLOCK: ethers.utils.parseEther('0.892230').toString()
  }]
  const EXACT_ETA = '1626087600'
  









  const config = network.name === "mainnet" ? MainnetConfig : TestnetConfig

  const timelock = Timelock__factory.connect(config.Timelock, (await ethers.getSigners())[0]);

  for(let i = 0; i < REWARDINFO.length; i++) {
    const rewardInfo = REWARDINFO[i]
    console.log(`>> Timelock: Adding a grazing range's reward info: "${rewardInfo.PHASE_NAME}" via Timelock`);
    await timelock.queueTransaction(
        config.GrazingRange.address, '0',
        'addRewardInfo(uint256,uint256,uint256)',
        ethers.utils.defaultAbiCoder.encode(
            ['uint256', 'uint256', 'uint256'],
            [
                rewardInfo.CAMPAIGN_ID,
                rewardInfo.ENDBLOCK,
                rewardInfo.REWARD_PER_BLOCK,
            ]
        ), EXACT_ETA, { gasPrice: 30000000000 }
    );
    console.log("generate timelock.executeTransaction:")
    console.log(`await timelock.executeTransaction('${config.GrazingRange.address}', '0', 'addRewardInfo(uint256,uint256,uint256)', ethers.utils.defaultAbiCoder.encode(['uint256', 'uint256', 'uint256'],['${rewardInfo.CAMPAIGN_ID}','${rewardInfo.ENDBLOCK}','${rewardInfo.REWARD_PER_BLOCK}']), ${EXACT_ETA})`)
    console.log("✅ Done");
  }
};

export default func;
func.tags = ['TimelockAddGrazingRangeRewardInfos'];