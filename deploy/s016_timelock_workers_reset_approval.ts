import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';
import { ethers } from 'hardhat';
import { Timelock__factory } from '../typechain'

interface IResetApproved {
    TOKEN: string
    SPENDER: string
}

interface IResetApprovalParams {
    WORKER_NAME: string
    WORKER_ADDR: string
    RESET_APPROVED: Array<IResetApproved>
}

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

  const RESET_APPROVED: Array<IResetApprovalParams> = [{
    WORKER_NAME: "SUSHI-ETH Worker",
    WORKER_ADDR: "0xd9811CeD97545243a13608924d6648251B07ed1A",
    RESET_APPROVED: [{
        TOKEN: '',
        SPENDER: ''
    }]
  }];
  
  const TIMELOCK = '0xb3c3aE82358DF7fC0bd98629D5ed91767e45c337';
  const EXACT_ETA = '1619103780';











  const timelock = Timelock__factory.connect(TIMELOCK, (await ethers.getSigners())[0]);

  for(let i = 0; i < RESET_APPROVED.length; i++) {
    const resetApproved = RESET_APPROVED[i]
    for(let j = 0; j < resetApproved.RESET_APPROVED.length; j++) {
        console.log(`>> Timelock: reset approval ${resetApproved.RESET_APPROVED[j].SPENDER} to spend ${resetApproved.RESET_APPROVED[j].TOKEN}: "${resetApproved.WORKER_NAME}" via Timelock`);
        await timelock.queueTransaction(
            resetApproved.WORKER_ADDR, '0',
            'resetApproval(address,address)',
            ethers.utils.defaultAbiCoder.encode(
                ['address', 'address'],
                [
                    resetApproved.RESET_APPROVED[j].TOKEN,
                    resetApproved.RESET_APPROVED[j].SPENDER,
                ]
            ), EXACT_ETA
        );
        console.log("generate timelock.executeTransaction:")
        console.log(`await timelock.executeTransaction('${resetApproved.WORKER_ADDR}', '0', 'resetApproval(address,address)', ethers.utils.defaultAbiCoder.encode(['address', 'address'],['${resetApproved.RESET_APPROVED[j].TOKEN}','${resetApproved.RESET_APPROVED[j].SPENDER}']), ${EXACT_ETA})`)
        console.log("✅ Done");
    }
  }
};

export default func;
func.tags = ['TimelockWorkersResetApproval'];