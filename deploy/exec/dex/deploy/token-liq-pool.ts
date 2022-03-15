import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { ethers, upgrades } from "hardhat";
import {
  MockERC20,
  MockERC20__factory,
  MockWBNB__factory,
  PancakeFactory__factory,
  PancakeRouter__factory,
} from "../../../../typechain";
import { BigNumber } from "ethers";
import { ConfigEntity } from "../../../entities";
import { MasterChefLike } from "../../../entities/masterchef-like";
import { MasterChefLikeFactory } from "../../../adaptors/mastercheflike/factory";

interface IPair {
  quoteToken: string;
  quoteTokenAddr: string;
  reserveQuoteToken: BigNumber;
  reserveBaseToken: BigNumber;
}

interface IToken {
  symbol: string;
  name: string;
  decimals?: string;
  address?: string;
  mintAmount?: BigNumber;
  pairs: Array<IPair>;
}

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const config = ConfigEntity.getConfig();

  const FOREVER = 20000000000;
  const WHICH_MASTERCHEF = MasterChefLike.pancake;
  const MASTERCHEF_LIKE_ADDRESS = config.YieldSources.Pancakeswap!.MasterChef;
  const FACTORY = config.YieldSources.Pancakeswap!.FactoryV2;
  const ROUTER = config.YieldSources.Pancakeswap!.RouterV2;
  const WBNB = config.Tokens.WBNB!;
  const TOKENS: Array<IToken> = [
    {
      symbol: "XWG",
      name: "XWG",
      mintAmount: ethers.utils.parseEther("100000000000"),
      decimals: "18",
      pairs: [
        {
          quoteToken: "USDC",
          quoteTokenAddr: config.Tokens.USDC!,
          reserveQuoteToken: ethers.utils.parseUnits("1000000", 18),
          reserveBaseToken: ethers.utils.parseUnits("16800000", 18),
        },
      ],
    },
  ];

  const deployer = (await ethers.getSigners())[0];

  const factory = PancakeFactory__factory.connect(FACTORY, deployer);
  const router = PancakeRouter__factory.connect(ROUTER, deployer);
  const masterchefLike = MasterChefLikeFactory.newMasterChefLike(WHICH_MASTERCHEF, MASTERCHEF_LIKE_ADDRESS, deployer);
  const wbnb = MockWBNB__factory.connect(WBNB, deployer);

  const MockERC20 = (await ethers.getContractFactory("MockERC20", deployer)) as MockERC20__factory;

  for (let i = 0; i < TOKENS.length; i++) {
    console.log("============================================");
    let token: MockERC20;

    if (TOKENS[i].address === undefined) {
      // deploy token
      console.log(`>> Deploying ${TOKENS[i].symbol}`);
      token = (await upgrades.deployProxy(MockERC20, [
        TOKENS[i].name,
        TOKENS[i].symbol,
        TOKENS[i].decimals,
      ])) as MockERC20;
      await token.deployTransaction.wait(3);
      console.log(`>> ${TOKENS[i].symbol} deployed at: ${token.address}`);
    } else {
      console.log(`>> ${TOKENS[i].symbol} is deployed at ${TOKENS[i].address}`);
      token = MockERC20__factory.connect(TOKENS[i].address!, deployer);
    }

    if (TOKENS[i].mintAmount !== undefined) {
      // mint token
      console.log(`>> Minting ${TOKENS[i].mintAmount} ${TOKENS[i].symbol}`);
      await (await token.mint(deployer.address, TOKENS[i].mintAmount!)).wait(3);
      console.log(`✅ Done`);
    }

    // mock liquidity
    for (let j = 0; j < TOKENS[i].pairs.length; j++) {
      const quoteToken = MockERC20__factory.connect(TOKENS[i].pairs[j].quoteTokenAddr, deployer);

      let lp = await factory.getPair(token.address, quoteToken.address);

      if (lp.toLowerCase() === ethers.constants.AddressZero.toLowerCase()) {
        console.log(`>> Creating the ${TOKENS[i].symbol}-${TOKENS[i].pairs[j].quoteToken} Trading Pair`);
        await (
          await factory.createPair(token.address, TOKENS[i].pairs[j].quoteTokenAddr, { gasLimit: 3000000 })
        ).wait(3);
        console.log(`✅ Done`);
      }

      // if quoteToken is WBNB, wrap it before add Liquidity
      if (quoteToken.address.toLowerCase() == wbnb.address.toLowerCase()) {
        console.log(`>> Wrapping ${TOKENS[i].pairs[j].reserveQuoteToken} BNB`);
        await (await wbnb.deposit({ value: TOKENS[i].pairs[j].reserveQuoteToken })).wait(3);
        console.log(`✅ Done`);
      }

      // add liquidity
      console.log(`>> Adding liquidity for ${TOKENS[i].symbol}-${TOKENS[i].pairs[j].quoteToken}`);
      await token.approve(router.address, TOKENS[i].pairs[j].reserveBaseToken);
      await quoteToken.approve(router.address, TOKENS[i].pairs[j].reserveQuoteToken);
      const addLiqTx = await router.addLiquidity(
        token.address,
        quoteToken.address,
        TOKENS[i].pairs[j].reserveBaseToken,
        TOKENS[i].pairs[j].reserveQuoteToken,
        "0",
        "0",
        deployer.address,
        FOREVER,
        { gasLimit: 5000000 }
      );
      await addLiqTx.wait(3);
      console.log(`✅ Done at ${addLiqTx.hash}`);

      lp = await factory.getPair(token.address, quoteToken.address);
      console.log(`>> Adding the ${TOKENS[i].symbol}-${TOKENS[i].pairs[j].quoteToken} LP to MasterChef`);
      console.log(`>> ${TOKENS[i].symbol}-${TOKENS[i].pairs[j].quoteToken} LP address: ${lp}`);
      const addPoolTx = await masterchefLike.addPool(1000, lp);
      await addPoolTx.wait(3);
      console.log(`✅ Done at ${addPoolTx.hash}`);
    }
  }
};

export default func;
func.tags = ["TestnetDeployTokens"];
