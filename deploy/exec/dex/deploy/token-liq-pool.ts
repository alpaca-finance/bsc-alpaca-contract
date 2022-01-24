import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { ethers, upgrades } from "hardhat";
import {
  MockERC20,
  MockERC20__factory,
  MockWBNB__factory,
  PancakeFactory__factory,
  PancakeMasterChef__factory,
  PancakeRouter__factory,
  SpookyMasterChef__factory,
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
  decimals?: string;
  address?: string;
  mintAmount?: string;
  pairs: Array<IPair>;
}

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const config = ConfigEntity.getConfig();

  const FOREVER = 20000000000;
  const SPOOKY_FLAG = true;
  const PANCAKE_MASTERCHEF = config.Exchanges.SpookySwap!.SpookyMasterChef;
  const PANCAKE_FACTORY = config.Exchanges.SpookySwap!.SpookyFactory;
  const PANCAKE_ROUTER = config.Exchanges.SpookySwap!.SpookyRouter;
  const WBNB = config.Tokens.WFTM!;
  const TOKENS: Array<IToken> = [
    {
      symbol: "BOO",
      name: "BOO",
      address: config.Tokens.BOO!,
      decimals: "18",
      pairs: [
        {
          quoteToken: "WFTM",
          quoteTokenAddr: config.Tokens.WFTM!,
          reserveQuoteToken: ethers.utils.parseEther("1"),
          reserveBaseToken: ethers.utils.parseEther("12.2144991"),
        },
      ],
    },
  ];

  const deployer = (await ethers.getSigners())[0];

  const factory = PancakeFactory__factory.connect(PANCAKE_FACTORY, deployer);
  const router = PancakeRouter__factory.connect(PANCAKE_ROUTER, deployer);
  const pancakeMasterchef = PancakeMasterChef__factory.connect(PANCAKE_MASTERCHEF, deployer);
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
      if (!SPOOKY_FLAG) {
        const addPoolTx = await pancakeMasterchef.add(1000, lp, true);
        await addPoolTx.wait(3);
        console.log(`✅ Done at ${addPoolTx.hash}`);
      } else {
        const spookyMasterChef = SpookyMasterChef__factory.connect(PANCAKE_MASTERCHEF, deployer);
        const addPoolTx = await spookyMasterChef.add(1000, lp);
        await addPoolTx.wait(3);
        console.log(`✅ Done at ${addPoolTx.hash}`);
      }
    }
  }
};

export default func;
func.tags = ["TestnetDeployTokens"];
