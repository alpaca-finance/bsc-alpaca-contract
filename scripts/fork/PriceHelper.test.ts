import chai from "chai";
import "@openzeppelin/test-helpers";
import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
import {
  ChainLinkPriceOracle__factory,
  PriceHelper,
  PriceHelper__factory,
  PancakeFactory__factory,
  PancakePair__factory,
} from "../../typechain";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import * as mainnetConfig from "../../.mainnet.json";
import { BigNumber } from "@ethersproject/bignumber";

async function main() {
  //
  const PCS_FACTORY_ADDRESS = mainnetConfig.Exchanges.Pancakeswap.FactoryV2;

  const CHAINLINK_ADDRESS = mainnetConfig.Oracle.ChainLinkOracle;
  const DEPLOYER_ADDRESS = "0xC44f82b07Ab3E691F826951a6E335E1bC1bB0B51";

  // TOKEN
  const WBNB = mainnetConfig.Tokens.WBNB;
  const BUSD = mainnetConfig.Tokens.BUSD;
  const USD = mainnetConfig.Tokens.USD;

  const provider = new ethers.providers.JsonRpcProvider(process.env.MAINNET_FORK_URL);
  await provider.send("hardhat_impersonateAccount", [DEPLOYER_ADDRESS]);
  const signer = provider.getSigner(DEPLOYER_ADDRESS);
  const deployer = await SignerWithAddress.create(signer);

  const ChainLinkPriceOracle = (await ethers.getContractFactory(
    "ChainLinkPriceOracle",
    deployer
  )) as ChainLinkPriceOracle__factory;

  const chainLink = await ChainLinkPriceOracle.attach(CHAINLINK_ADDRESS);

  const [wbnbBusdPrice] = await chainLink.getPrice(WBNB, BUSD);

  const [wbnbUsdPrice] = await chainLink.getPrice(WBNB, USD);

  const [busdUSDPrice] = await chainLink.getPrice(BUSD, USD);

  //GET RESERVED FROM PCS
  const PancakeFactory = (await ethers.getContractFactory("PancakeFactory", deployer)) as PancakeFactory__factory;
  const pancakeFactory = await PancakeFactory.attach(PCS_FACTORY_ADDRESS);

  const lpWbnbBusdAddress = await pancakeFactory.getPair(WBNB, BUSD);

  const PancakePair = (await ethers.getContractFactory("PancakePair", deployer)) as PancakePair__factory;
  const pancakePair = await PancakePair.attach(lpWbnbBusdAddress);
  const [_r0, _r1] = await pancakePair.getReserves();
  const totalSupply = await pancakePair.totalSupply();

  console.log("====== FROM SCRIPT ======");
  console.log("CHAINLINK GET PRICE [WBNB][BUSD]", wbnbBusdPrice.toString());
  console.log("CHAINLINK GET PRICE [WBNB][USD]", wbnbUsdPrice.toString());
  console.log("CHAINLINK GET PRICE [BUSD][USD]", busdUSDPrice.toString());
  console.log(
    "CHAINLINK GET PRICE [WBNB][USD] * [BUSD][USD]",
    wbnbUsdPrice.mul(busdUSDPrice).div(ethers.constants.WeiPerEther).toString()
  );
  console.log("LP WBNB BUSD PAIR", lpWbnbBusdAddress);
  console.log("PCS RESERVED WBNB BUSD  R0 ", _r0.toString());
  console.log("PCS RESERVED WBNB BUSD  R1 ", _r1.toString());
  console.log("PCS PRICE BNB", _r1.mul(ethers.constants.WeiPerEther).div(_r0).toString());

  console.log("PCS totalSupply", totalSupply.toString());

  const PriceHelper = (await ethers.getContractFactory("PriceHelper", deployer)) as PriceHelper__factory;
  const priceHelper = (await upgrades.deployProxy(PriceHelper, [CHAINLINK_ADDRESS, USD])) as PriceHelper;
  await priceHelper.deployed();

  console.log("====== PRICE HELPER CONTRACT  ======");
  const bnbBusdDollar = await priceHelper.lpToDollar(ethers.constants.WeiPerEther, lpWbnbBusdAddress);
  console.log("PRICEHELPER BNBBUSD dollar", bnbBusdDollar.toString());

  /* 2 *sqrt(r0*r1) *sqrt(p0*p1)/totalSupply
        2*(8923276963968911148448930.91470947808468310002) *  (18859091029951576115.27785427756611280172)/ 7235536073990741153904959
        =46516219621621630508.847652493124686795
 */
  const manualLpValue = BigNumber.from("46516219621621630508");
  expect(bnbBusdDollar).to.be.eq(manualLpValue);
  expect(await priceHelper.dollarToLp(manualLpValue, lpWbnbBusdAddress)).to.be.eq(ethers.constants.WeiPerEther);

  console.log("====== DONE ======");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
