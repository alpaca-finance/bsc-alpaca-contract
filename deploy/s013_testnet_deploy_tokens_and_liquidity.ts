import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction, DeploymentSubmission } from 'hardhat-deploy/types';
import { ethers, upgrades } from 'hardhat';
import { MockERC20, MockERC20__factory, MockWBNB__factory, PancakeFactory__factory, PancakeMasterChef, PancakeMasterChef__factory, PancakeRouter__factory } from '../typechain';
import { BigNumber } from 'ethers';

interface IPair {
  quoteToken: string
  quoteTokenAddr: string
  reserveQuoteToken: BigNumber
  reserveBaseToken: BigNumber
}

interface IToken {
  symbol: string
  name: string
  address?: string
  mintAmount?: string
  pairs: Array<IPair>
}

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const FOREVER = 20000000000;
  const PANCAKE_MASTERCHEF = '0x85F6A87A056313Fd1717937Cf3cC7BCe3e3445D1'
  const PANCAKE_FACTORY = '0xC907F67B0fBAEbe7B557B15a5Ef77345578C4202'
  const PANCAKE_ROUTER = '0xA0bC344E20d89ccA131f869E059499F41d7a13D3'
  const WBNB = '0xDfb1211E2694193df5765d54350e1145FD2404A1'
  const TOKENS: Array<IToken> = [{
<<<<<<< HEAD
    symbol: 'TUSD',
    name: 'TUSD',
    mintAmount: ethers.utils.parseEther('8888888888888').toString(),
    pairs: [{
      quoteToken: 'BUSD',
      quoteTokenAddr: '0x0266693F9Df932aD7dA8a9b44C2129Ce8a87E81f',
      reserveQuoteToken: ethers.utils.parseEther('36113222'),
      reserveBaseToken: ethers.utils.parseEther('36220736')
=======
    symbol: 'ETH',
    name: 'ETH',
    address: '0xd5c082df9eDE041548fa79e05A1CB077036ca86F',
    pairs: [{
      quoteToken: 'USDT',
      quoteTokenAddr: '0xE60Fa777dEb72C364447BB18C823C4731FbeD671',
      reserveQuoteToken: ethers.utils.parseEther('23140000'),
      reserveBaseToken: ethers.utils.parseEther('10000')
    }]
  }, {
    symbol: 'BTCB',
    name: 'BTCB',
    address: '0xCCaf3FC49B0D0F53fe2c08103F75A397052983FB',
    pairs: [{
      quoteToken: 'BUSD',
      quoteTokenAddr: '0x0266693F9Df932aD7dA8a9b44C2129Ce8a87E81f',
      reserveQuoteToken: ethers.utils.parseEther('3773930'),
      reserveBaseToken: ethers.utils.parseEther('100')
>>>>>>> deploy/wault-pools-5-cake-maxi-2
    }]
  }]

  const { deployments, getNamedAccounts } = hre;
  const { deploy } = deployments;

  const { deployer } = await getNamedAccounts();

  const factory = PancakeFactory__factory.connect(
    PANCAKE_FACTORY, (await ethers.getSigners())[0]);
  const router = PancakeRouter__factory.connect(
    PANCAKE_ROUTER, (await ethers.getSigners())[0]);
  const pancakeMasterchef = PancakeMasterChef__factory.connect(
    PANCAKE_MASTERCHEF, (await ethers.getSigners())[0]);
  const wbnb = MockWBNB__factory.connect(
    WBNB, (await ethers.getSigners())[0]);

  const MockERC20 = (await ethers.getContractFactory(
    'MockERC20',
    (await ethers.getSigners())[0]
  )) as MockERC20__factory;

  for(let i = 0; i < TOKENS.length; i++) {
    console.log("============================================")
    let token: MockERC20

    if (TOKENS[i].address === undefined) {
      // deploy token
      console.log(`>> Deploying ${TOKENS[i].symbol}`);
      token = await upgrades.deployProxy(MockERC20, [TOKENS[i].name, TOKENS[i].symbol]) as MockERC20;
      await token.deployed();
      console.log(`>> ${TOKENS[i].symbol} deployed at: ${token.address}`);
    } else {
      console.log(`>> ${TOKENS[i].symbol} is deployed at ${TOKENS[i].address}`)
      token = MockERC20__factory.connect(TOKENS[i].address!, (await ethers.getSigners())[0])
    }
    
    if (TOKENS[i].mintAmount !== undefined) {
      // mint token
      console.log(`>> Minting ${TOKENS[i].mintAmount} ${TOKENS[i].symbol}`);
      await token.mint(deployer, TOKENS[i].mintAmount!);
      console.log(`✅ Done`)
    }

    // mock liquidity
    for(let j = 0; j < TOKENS[i].pairs.length; j++) {
      console.log(`>> Creating the ${TOKENS[i].symbol}-${TOKENS[i].pairs[j].quoteToken} Trading Pair`)
      await factory.createPair(token.address, TOKENS[i].pairs[j].quoteTokenAddr, { gasLimit: 2000000 })
      console.log(`✅ Done`)

      const quoteToken = MockERC20__factory.connect(TOKENS[i].pairs[j].quoteTokenAddr, (await ethers.getSigners())[0])

      // if quoteToken is WBNB, wrap it before add Liquidity
      if(quoteToken.address.toLowerCase() == wbnb.address.toLowerCase()) {
        console.log(`>> Wrapping ${TOKENS[i].pairs[j].reserveQuoteToken} BNB`)
        await wbnb.deposit({value: TOKENS[i].pairs[j].reserveQuoteToken})
        console.log(`✅ Done`)
      }

      // add liqudity
      console.log(`>> Adding liquidity for ${TOKENS[i].symbol}-${TOKENS[i].pairs[j].quoteToken}`)
      await token.approve(router.address, TOKENS[i].pairs[j].reserveBaseToken)
      await quoteToken.approve(router.address, TOKENS[i].pairs[j].reserveQuoteToken)
      const addLiqTx = await router.addLiquidity(
        token.address,
        quoteToken.address,
        TOKENS[i].pairs[j].reserveBaseToken,
        TOKENS[i].pairs[j].reserveQuoteToken,
        '0', '0', (await ethers.getSigners())[0].address, FOREVER, { gasLimit: 5000000 }
      )
      console.log(`✅ Done at ${addLiqTx.hash}`);

      console.log(`>> Adding the ${TOKENS[i].symbol}-${TOKENS[i].pairs[j].quoteToken} LP to MasterChef`)
      const lp = await factory.getPair(token.address, quoteToken.address)
      console.log(`>> ${TOKENS[i].symbol}-${TOKENS[i].pairs[j].quoteToken} LP address: ${lp}`)
      const addPoolTx = await pancakeMasterchef.add(1000, lp, true)
      console.log(`✅ Done at ${addPoolTx.hash}`);
    }
  }
};

export default func;
func.tags = ['TestnetDeployTokens'];