import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';
import { ethers } from 'hardhat';
import { WexMaster__factory, WaultSwapFactory__factory } from '../typechain';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { network } = hre;

  if (network.name !== 'testnet') {
    console.log('This deployment script should be run against testnet only')
    return
  }

  const WAULT_SWAP_FACTORY_ADDRESS = '0x894B83d7060634920a63863b3174F68450DA41ee';
  const WEX_MASTER_ADDRESS = '0x9038546960B387DD7aD9216Dcc9720061871FfE4';
  const PAIRS = [
    ['WEX-WBNB', '0xB4Eca4d2dD3E58C2F8BB33E47750Dc1A86B85EF7', '0xDfb1211E2694193df5765d54350e1145FD2404A1'],
  ];

  const signers = await ethers.getSigners()

  const factory = WaultSwapFactory__factory.connect(
    WAULT_SWAP_FACTORY_ADDRESS, signers[0]);
  const wexMaster = WexMaster__factory.connect(
    WEX_MASTER_ADDRESS, signers[0]);

  for (const [pairName, token0Address, token1Address] of PAIRS) {
    // create pair
    await factory.createPair(
      token0Address,
      token1Address,
      {
        gasLimit: '10000000',
      }
    );

    const lpAddress = await factory.getPair(token0Address, token1Address)
    console.log(`>> ${pairName} LP created with address: `, lpAddress)
    // add to wexmaster pool
    await wexMaster.add(1000, lpAddress, true)
    console.log(`>> ${pairName} pool added with ID: `, (await wexMaster.poolLength()).toString())
  }

  console.log("✅ Done")
};

export default func;
func.tags = ['Testnet', 'WaultSwapAddPool'];