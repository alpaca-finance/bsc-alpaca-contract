import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';
import { ethers } from 'hardhat';
import { Timelock__factory } from '../typechain'

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
  const STRATEGY = [
    '0xCec2506E2420f2616221EcA10eE5663cFbE6780E',
    '0x1DBa79e73a7Ea9749fc28B921bc9431D09BEf2B5',
    '0xc7c025aA69F4b525E3F9f5186b524492ee1C86bB',
    '0x5e2911d70d7a659Da0dA26989F445aeCAC58f2E6'
  ]
  // const STRATEGY = [
  //   '0xd80783De91fbEd9F7995A97D4C02917295F86F68',
  //   '0xE38EBFE8F314dcaD61d5aDCB29c1A26F41BEd0Be',
  //   '0xE574dc08aa579720Dfacd70D3DAE883d29874599',
  //   '0x95Ff1336985723aa46078995454d7A7Fd9F5401e'
  // ]

  const WORKERS = [
    '0x7D0ea848563F5FA0Ae5C2aF2d8207C01Ea45B0D2',
  ];

  const TIMELOCK = '0x2D5408f2287BF9F9B05404794459a846651D0a59';
  const EXACT_ETA = '1619676000';











  const timelock = Timelock__factory.connect(TIMELOCK, (await ethers.getSigners())[0]);

  for(let i = 0; i < WORKERS.length; i++) {
    console.log(">> Timelock: Setting okStrats via Timelock");
    await timelock.queueTransaction(
      WORKERS[i], '0',
      'setStrategyOk(address[],bool)',
      ethers.utils.defaultAbiCoder.encode(
        ['address[]','bool'],
        [
          STRATEGY, false
        ]
      ), EXACT_ETA
    );
    const strats = STRATEGY.map((strat) => `'${strat}'`)
    console.log("generate timelock.executeTransaction:")
    console.log(`await timelock.executeTransaction('${WORKERS[i]}', '0', 'setStrategyOk(address[],bool)', ethers.utils.defaultAbiCoder.encode(['address[]','bool'],[[${strats}], false]), ${EXACT_ETA})`)
    console.log("✅ Done");
  }
};

export default func;
func.tags = ['TimelockUpdateAddStratWorkers'];