import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';
import { ethers, network } from 'hardhat';
import { ChainLinkPriceOracle__factory } from '../typechain'
import TestnetConfig from '../.testnet.json'
import MainnetConfig from '../.mainnet.json'

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
  const TOKEN0_SYMBOLS = [
    'CAKE',
    'BTCB',
    'ETH',
    'USDT',
    'WBNB',
    'DOT',
    'LINK',
    'YFI',
    'VAI',
    'USDC',
    'DAI',
    'BTCB',
    'USDT',
    'CAKE',
    'ETH'
  ];
  const TOKEN1_SYMBOLS = [
    'WBNB',
    'WBNB',
    'WBNB',
    'BUSD',
    'BUSD',
    'WBNB',
    'WBNB',
    'WBNB',
    'BUSD',
    'BUSD',
    'BUSD',
    'BUSD',
    'WBNB',
    'BUSD',
    'BUSD'
  ];
  const AGGREGATORV3S = [
    '0xcB23da9EA243f53194CBc2380A6d4d9bC046161f',
    '0x116EeB23384451C78ed366D4f67D5AD44eE771A0',
    '0x63D407F32Aa72E63C7209ce1c2F5dA40b3AaE726',
    '0xB97Ad0E74fa7d920791E90258A6E2085088b4320',
    '0x0567F2323251f0Aab15c8dFb1967E4e8A7D42aeE',
    '0xBA8683E9c3B1455bE6e18E7768e8cAD95Eb5eD49',
    '0xB38722F6A608646a538E882Ee9972D15c86Fc597',
    '0xF841761481DF19831cCC851A54D8350aE6022583',
    '0x058316f8Bb13aCD442ee7A216C7b60CFB4Ea1B53',
    '0x51597f405303C4377E36123cBc172b13269EA163',
    '0x132d3C0B1D2cEa0BC552588063bdBb210FDeecfA',
    '0x264990fbd0A4796A3E3d8E37C4d5F87a3aCa5Ebf',
    '0xD5c40f5144848Bd4EF08a9605d860e727b991513',
    '0xB6064eD41d4f67e353768aA239cA86f4F73665a1',
    '0x9ef1B8c0E4F7dc8bF5719Ea496883DC6401d5b2e'
  ];





  




  const config = network.name === "mainnet" ? MainnetConfig : TestnetConfig
  const tokenList: any = config.Tokens
  const token0Addrs: Array<string> = TOKEN0_SYMBOLS.map((t) => {
    const addr = tokenList[t]
    if (addr === undefined) {
      throw(`error: token: unable to find address of ${t}`)
    }
    return addr
  })
  const token1Addrs: Array<string> = TOKEN1_SYMBOLS.map((t) => {
    const addr = tokenList[t]
    if (addr === undefined) {
      throw(`error: token: unable to find address of ${t}`)
    }
    return addr
  })

  const chainLinkPriceOracle = ChainLinkPriceOracle__factory.connect(config.Oracle.ChainLinkOracle, (await ethers.getSigners())[0]);
  console.log(">> Adding price source to chain link price oracle");
  await chainLinkPriceOracle.setPriceFeeds(token0Addrs, token1Addrs, AGGREGATORV3S ,{ gasLimit: '10000000' });
  console.log("✅ Done")
};

export default func;
func.tags = ['AddSourceChainLinkPriceOracle'];