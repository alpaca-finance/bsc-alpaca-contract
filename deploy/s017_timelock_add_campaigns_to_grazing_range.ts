import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';
import { ethers } from 'hardhat';
import { Timelock__factory } from '../typechain'

interface IAddGrazingRangeCampaignParam {
    NAME: string
    STAKING_TOKEN: string
    REWARD_TOKEN: string
    START_BLOCK: string
}

type IAddGrazingRangeCampaignParamList = Array<IAddGrazingRangeCampaignParam>

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
  const EXACT_ETA = '1621220700';
  const CAMPAIGNS: IAddGrazingRangeCampaignParamList = [{
    NAME: 'ibALPACA-pCWS',
    STAKING_TOKEN: '0xf1bE8ecC990cBcb90e166b71E368299f0116d421',
    REWARD_TOKEN: '0xbcf39f0edda668c58371e519af37ca705f2bfcbd',
    START_BLOCK: '7485000'
  }]
    











  const timelock = Timelock__factory.connect(TIMELOCK, (await ethers.getSigners())[0]);

  for(let i = 0; i < CAMPAIGNS.length; i++) {
    const campaign = CAMPAIGNS[i]
    console.log(`>> Timelock: Adding a grazing range's campaign: "${campaign.NAME}" via Timelock`);
    await timelock.queueTransaction(
        GRAZING_RANGE, '0',
        'addCampaignInfo(address,address,uint256)',
        ethers.utils.defaultAbiCoder.encode(
            ['address', 'address', 'uint256'],
            [
                campaign.STAKING_TOKEN,
                campaign.REWARD_TOKEN,
                campaign.START_BLOCK,
            ]
        ), EXACT_ETA, { gasPrice: 30000000000 }
    );
    console.log("generate timelock.executeTransaction:")
    console.log(`await timelock.executeTransaction('${GRAZING_RANGE}', '0', 'addCampaignInfo(address,address,uint256)', ethers.utils.defaultAbiCoder.encode(['address', 'address', 'uint256'],['${campaign.STAKING_TOKEN}','${campaign.REWARD_TOKEN}','${campaign.START_BLOCK}']), ${EXACT_ETA})`)
    console.log("✅ Done");
  }
};

export default func;
func.tags = ['TimelockAddGrazingRangeCampaigns'];