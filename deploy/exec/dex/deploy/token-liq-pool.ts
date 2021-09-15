import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction, DeploymentSubmission } from "hardhat-deploy/types";
import { ethers, upgrades } from "hardhat";
import {
  MockERC20,
  MockERC20__factory,
  MockWBNB__factory,
  PancakeFactory__factory,
  PancakeMasterChef,
  PancakeMasterChef__factory,
  PancakeRouter__factory,
} from "../../../../typechain";
import { BigNumber } from "ethers";
import { ConfigEntity } from "../../../entities";

interface IPair {
  quoteToken: string;
  quoteTokenAddr: string;
  reserveQuoteToken: BigNumber;
  reserveBaseToken: BigNumber;
}

interface IToken {
  symbol: string;
  name: string;
  address?: string;
  mintAmount?: string;
  pairs: Array<IPair>;
}

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const config = ConfigEntity.getConfig();

  const FOREVER = 20000000000;
  const PANCAKE_MASTERCHEF = config.Exchanges.Mdex.BSCPool;
  const PANCAKE_FACTORY = config.Exchanges.Mdex.MdexFactory;
  const PANCAKE_ROUTER = config.Exchanges.Mdex.MdexRouter;
  const WBNB = config.Tokens.WBNB;
  const TOKENS: Array<IToken> = [
    // {
    //   symbol: "BTCB",
    //   name: "BTCB",
    //   address: config.Tokens.BTCB,
    //   pairs: [
    //     {
    //       quoteToken: "USDT",
    //       quoteTokenAddr: config.Tokens.USDT,
    //       reserveQuoteToken: ethers.utils.parseEther("23023000"),
    //       reserveBaseToken: ethers.utils.parseEther("500"),
    //     },
    //   ],
    // },
    {
      symbol: "ETH",
      name: "ETH",
      address: config.Tokens.ETH,
      pairs: [
        {
          quoteToken: "USDT",
          quoteTokenAddr: config.Tokens.USDT,
          reserveQuoteToken: ethers.utils.parseEther("10000"),
          reserveBaseToken: ethers.utils.parseEther("33350000"),
        },
      ],
    },
  ];

  const { deployments, getNamedAccounts } = hre;
  const { deploy } = deployments;

  const { deployer } = await getNamedAccounts();

  const factory = PancakeFactory__factory.connect(PANCAKE_FACTORY, (await ethers.getSigners())[0]);
  const router = PancakeRouter__factory.connect(PANCAKE_ROUTER, (await ethers.getSigners())[0]);
  const pancakeMasterchef = PancakeMasterChef__factory.connect(PANCAKE_MASTERCHEF, (await ethers.getSigners())[0]);
  const wbnb = MockWBNB__factory.connect(WBNB, (await ethers.getSigners())[0]);

  const MockERC20 = (await ethers.getContractFactory(
    "MockERC20",
    (
      await ethers.getSigners()
    )[0]
  )) as MockERC20__factory;

  for (let i = 0; i < TOKENS.length; i++) {
    console.log("============================================");
    let token: MockERC20;

    if (TOKENS[i].address === undefined) {
      // deploy token
      console.log(`>> Deploying ${TOKENS[i].symbol}`);
      token = (await upgrades.deployProxy(MockERC20, [TOKENS[i].name, TOKENS[i].symbol])) as MockERC20;
      await token.deployed();
      console.log(`>> ${TOKENS[i].symbol} deployed at: ${token.address}`);
    } else {
      console.log(`>> ${TOKENS[i].symbol} is deployed at ${TOKENS[i].address}`);
      token = MockERC20__factory.connect(TOKENS[i].address!, (await ethers.getSigners())[0]);
    }

    if (TOKENS[i].mintAmount !== undefined) {
      // mint token
      console.log(`>> Minting ${TOKENS[i].mintAmount} ${TOKENS[i].symbol}`);
      await token.mint(deployer, TOKENS[i].mintAmount!);
      console.log(`✅ Done`);
    }

    // mock liquidity
    for (let j = 0; j < TOKENS[i].pairs.length; j++) {
      const quoteToken = MockERC20__factory.connect(TOKENS[i].pairs[j].quoteTokenAddr, (await ethers.getSigners())[0]);

      let lp = await factory.getPair(token.address, quoteToken.address);

      if (lp.toLowerCase() === ethers.constants.AddressZero.toLowerCase()) {
        console.log(`>> Creating the ${TOKENS[i].symbol}-${TOKENS[i].pairs[j].quoteToken} Trading Pair`);
        await factory.createPair(token.address, TOKENS[i].pairs[j].quoteTokenAddr, { gasLimit: 2000000 });
        console.log(`✅ Done`);
      }

      // if quoteToken is WBNB, wrap it before add Liquidity
      if (quoteToken.address.toLowerCase() == wbnb.address.toLowerCase()) {
        console.log(`>> Wrapping ${TOKENS[i].pairs[j].reserveQuoteToken} BNB`);
        await wbnb.deposit({ value: TOKENS[i].pairs[j].reserveQuoteToken });
        console.log(`✅ Done`);
      }

      // add liqudity
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
        (
          await ethers.getSigners()
        )[0].address,
        FOREVER,
        { gasLimit: 5000000 }
      );
      await addLiqTx.wait();
      console.log(`✅ Done at ${addLiqTx.hash}`);

      lp = await factory.getPair(token.address, quoteToken.address);
      console.log(`>> Adding the ${TOKENS[i].symbol}-${TOKENS[i].pairs[j].quoteToken} LP to MasterChef`);
      console.log(`>> ${TOKENS[i].symbol}-${TOKENS[i].pairs[j].quoteToken} LP address: ${lp}`);
      const addPoolTx = await pancakeMasterchef.add(1000, lp, true);
      console.log(`✅ Done at ${addPoolTx.hash}`);
    }
  }
};

export default func;
func.tags = ["TestnetDeployTokens"];
