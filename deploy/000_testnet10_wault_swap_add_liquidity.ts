import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';
import { ethers } from 'hardhat';
import { MockERC20__factory, WaultSwapRouter__factory } from '../typechain';

const FOREVER = 20000000000;

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { network } = hre;

  if (network.name !== 'testnet') {
    console.log('This deployment script should be run against testnet only')
    return
  }

  const WAULT_SWAP_ROUTER_ADDRESS = '0x8dFd9289dd0104CB581299e474D2a0E2168BF391';
  const PAIRS = [
    [
      'WEX-WBNB',// name
      '0xB4Eca4d2dD3E58C2F8BB33E47750Dc1A86B85EF7', // token0
      '0xDfb1211E2694193df5765d54350e1145FD2404A1', // token0
      '10000', // amount0
      '1', // amount1
    ],
  ];


  const signers = await ethers.getSigners()

  const router = WaultSwapRouter__factory.connect(
    WAULT_SWAP_ROUTER_ADDRESS, signers[0]);
  const wbnbAddress = await router.WETH()

  for (const [
      pairName,
      token0Address,
      token1Address,
      amount0,
      amount1,
    ] of PAIRS) {
    const token0 = MockERC20__factory.connect(token0Address, signers[0]);
    const token1 = MockERC20__factory.connect(token1Address, signers[0]);

    if (token0Address !== wbnbAddress) {
      await token0.approve(router.address, ethers.utils.parseEther(amount0));
      console.log(`>> ${pairName} approved ${token0Address}`)
    }

    if (token1Address !== wbnbAddress) {
      await token1.approve(router.address, ethers.utils.parseEther(amount1));
      console.log(`>> ${pairName} approved ${token1Address}`)
    }

    if (token0Address === wbnbAddress) {
      await router.addLiquidityETH(
        token1.address,
        ethers.utils.parseEther(amount1),
        '0', '0', signers[0].address, FOREVER,
        { value: amount0, gasLimit: 5000000 }
      )
    } else if (token1Address === wbnbAddress) {
      await router.addLiquidityETH(
        token0.address,
        ethers.utils.parseEther(amount0),
        '0', '0', signers[0].address, FOREVER,
        { value: amount1, gasLimit: 5000000 }
      )
    } else {
      await router.addLiquidity(
        token0.address,
        token1.address,
        ethers.utils.parseEther(amount0),
        ethers.utils.parseEther(amount1),
        '0', '0', signers[0].address, FOREVER,
        { gasLimit: 5000000 }
      )
    }

    console.log(`>> ${pairName} liquidity added`)
  }
  console.log("✅ Done")
};

export default func;
func.tags = ['Testnet', 'WaultSwapAddLiquidity'];