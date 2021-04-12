import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction, DeploymentSubmission } from 'hardhat-deploy/types';
import { ethers, upgrades } from 'hardhat';
import { MockERC20, MockERC20__factory, MockWBNB__factory, PancakeFactory__factory, PancakeMasterChef, PancakeMasterChef__factory, PancakeRouter__factory } from '../typechain';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const FOREVER = 20000000000;
  const PANCAKE_MASTERCHEF = '0xbCC50b0B0AFD19Ee83a6E79e6c01D51b16090A0B'
  const PANCAKE_FACTORY = '0x716e4852251f85BDFf23B2D5B53630b838A20FC8'
  const PANCAKE_ROUTER = '0xf46A02489B99C5A4a5cC31AA3F9eBD6A501D4B49'
  const WBNB = '0xDfb1211E2694193df5765d54350e1145FD2404A1'
  const TOKENS = [{
    symbol: 'ITAM',
    name: 'ITAM',
    mintAmount: ethers.utils.parseEther('500000000'),
    pairs: [{
      quoteToken: 'WBNB',
      quoteTokenAddr: '0xDfb1211E2694193df5765d54350e1145FD2404A1',
      reserveQuoteToken: ethers.utils.parseEther('1'),
      reserveBaseToken: ethers.utils.parseEther('5464.4808743169')
    }]
  }]

  const { deployments, getNamedAccounts, network } = hre;
  const { deploy } = deployments;

  if (network.name !== 'testnet') {
    console.log('This deployment script should be run against testnet only')
    return
  }

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
    // deploy token
    console.log(`>> Deploying ${TOKENS[i].symbol}`);
    const token = await upgrades.deployProxy(MockERC20, [TOKENS[i].name, TOKENS[i].symbol]) as MockERC20;
    await token.deployed();
    console.log(`>> ${TOKENS[i].symbol} deployed at: ${token.address}`);

    // mint token
    console.log(`>> Minting ${TOKENS[i].mintAmount} ${TOKENS[i].symbol}`);
    await token.mint(deployer, TOKENS[i].mintAmount);
    console.log(`✅ Done`)

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
      await router.addLiquidity(
        token.address,
        quoteToken.address,
        TOKENS[i].pairs[j].reserveBaseToken,
        TOKENS[i].pairs[j].reserveQuoteToken,
        '0', '0', (await ethers.getSigners())[0].address, FOREVER, { gasLimit: 5000000 }
      )
      console.log("✅ Done");

      console.log(`>> Adding the ${TOKENS[i].symbol}-${TOKENS[i].pairs[j].quoteToken} LP to MasterChef`)
      const lp = await factory.getPair(token.address, quoteToken.address)
      console.log(`>> ${TOKENS[i].symbol}-${TOKENS[i].pairs[j].quoteToken} LP address: ${lp}`)
      await pancakeMasterchef.add(1000, lp, true)
      console.log("✅ Done");
    }
  }
};

export default func;
func.tags = ['TestnetDeployTokens'];