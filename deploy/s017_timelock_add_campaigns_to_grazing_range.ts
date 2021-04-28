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
  const TIMELOCK = '0xb3c3aE82358DF7fC0bd98629D5ed91767e45c337';
  const GRAZING_RANGE = '0x9Ff38741EB7594aCE7DD8bb8107Da38aEE7005D6'
  const EXACT_ETA = '1619603100';
  const CAMPAIGNS: IAddGrazingRangeCampaignParamList = [{
    NAME: 'BUSD',
    STAKING_TOKEN: '0x6ad3A0d891C59677fbbB22E071613253467C382A',
    REWARD_TOKEN: '0x0266693F9Df932aD7dA8a9b44C2129Ce8a87E81f',
    START_BLOCK: '8373000'
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
        ), EXACT_ETA
    );
    console.log("generate timelock.executeTransaction:")
    console.log(`await timelock.executeTransaction('${GRAZING_RANGE}', '0', 'addCampaignInfo(address,address,uint256)', ethers.utils.defaultAbiCoder.encode(['address', 'address', 'uint256'],['${campaign.STAKING_TOKEN}','${campaign.REWARD_TOKEN}','${campaign.START_BLOCK}']), ${EXACT_ETA})`)
    console.log("✅ Done");
  }
};

export default func;
func.tags = ['TimelockAddGrazingRangeCampaigns'];