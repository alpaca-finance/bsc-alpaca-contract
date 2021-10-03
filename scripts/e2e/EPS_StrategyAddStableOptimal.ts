import { ethers, network, upgrades } from "hardhat";
import {
  BEP20__factory,
  OracleMedianizer__factory,
  PancakeswapV2Worker02__factory,
  SimplePriceOracle__factory,
  StrategyAddStableOptimal,
  StrategyAddStableOptimal__factory,
  Timelock__factory,
  Vault__factory,
  WorkerConfig__factory,
} from "../../typechain";
import MainnetConfig from "../../.mainnet.json";
import { duration, increase } from "../../test/helpers/time";
import { expect } from "chai";
import { BigNumber } from "ethers";

const toBytes32 = (number: BigNumber) => {
  return ethers.utils.hexlify(ethers.utils.zeroPad(number.toHexString(), 32));
};

async function reset(to: number) {
  await network.provider.request({
    method: "hardhat_reset",
    params: [
      {
        forking: {
          jsonRpcUrl: "http://127.0.0.1:8545",
          blockNumber: to,
        },
      },
    ],
  });
}

async function main() {
  const busdUsdcUsdtEpsPool = "0x160caed03795365f3a589f10c379ffa7d75d4e76";
  const alpacaDeployerAddress = "0xC44f82b07Ab3E691F826951a6E335E1bC1bB0B51";
  if (network.name !== "mainnetfork") throw new Error("not mainnet fork");
  await network.provider.request({
    method: "hardhat_impersonateAccount",
    params: [alpacaDeployerAddress],
  });

  const config = MainnetConfig;

  const alpacaDeployer = await ethers.getSigner(alpacaDeployerAddress);

  const timelock = Timelock__factory.connect(config.Timelock, alpacaDeployer);

  const busdVaultInfo = config.Vaults.find((v) => v.symbol === "ibBUSD");
  if (busdVaultInfo === undefined) throw new Error("not found ibBUSD");
  const busdVault = Vault__factory.connect(busdVaultInfo.address, alpacaDeployer);

  const usdtBusdWorkerInfo = busdVaultInfo.workers.find((w) => w.name === "USDT-BUSD PancakeswapWorker");
  if (usdtBusdWorkerInfo === undefined) throw new Error("not found USDT-BUSD PancakeswapWorker");
  const usdtBusdWorker = PancakeswapV2Worker02__factory.connect(usdtBusdWorkerInfo.address, alpacaDeployer);

  const busd = BEP20__factory.connect(config.Tokens.BUSD, alpacaDeployer);
  const usdt = BEP20__factory.connect(config.Tokens.USDT, alpacaDeployer);
  const cake = BEP20__factory.connect(config.Tokens.CAKE, alpacaDeployer);

  // Set AlpaceDeployer's BUSD balance
  const busdIndex = ethers.utils.solidityKeccak256(["uint256", "uint256"], [alpacaDeployerAddress, 1]);
  await network.provider.send("hardhat_setStorageAt", [
    busd.address,
    busdIndex,
    toBytes32(ethers.utils.parseEther("1000000000")),
  ]);
  expect(await busd.balanceOf(alpacaDeployerAddress)).to.be.eq(ethers.utils.parseEther("1000000000"));

  // Set AlpacaDeployer's USDT balance
  const usdtIndex = ethers.utils.solidityKeccak256(["uint256", "uint256"], [alpacaDeployerAddress, 1]);
  await network.provider.send("hardhat_setStorageAt", [
    usdt.address,
    usdtIndex,
    toBytes32(ethers.utils.parseEther("1000000000")),
  ]);
  expect(await usdt.balanceOf(alpacaDeployerAddress)).to.be.eq(ethers.utils.parseEther("1000000000"));

  // Set AlpacaDeployer's CAKE balance
  const cakeIndex = ethers.utils.solidityKeccak256(["uint256", "uint256"], [alpacaDeployerAddress, 1]);
  await network.provider.send("hardhat_setStorageAt", [
    cake.address,
    cakeIndex,
    toBytes32(ethers.utils.parseEther("1000000000")),
  ]);
  expect(await cake.balanceOf(alpacaDeployerAddress)).to.be.eq(ethers.utils.parseEther("1000000000"));

  // Deploy Add Stable Optimal
  // Setup StrategyAddStableOptimal strategy
  const StrategyAddStableOptimal = (await ethers.getContractFactory(
    "StrategyAddStableOptimal",
    alpacaDeployer
  )) as StrategyAddStableOptimal__factory;
  const addStableStrat = (await upgrades.deployProxy(StrategyAddStableOptimal, [
    busdUsdcUsdtEpsPool,
    config.Exchanges.Pancakeswap.RouterV2,
    busdVaultInfo.address,
    [config.Tokens.BUSD, config.Tokens.USDC, config.Tokens.USDT],
  ])) as StrategyAddStableOptimal;
  await addStableStrat.deployed();

  // Queue timelock to add new strategy
  const lastBlockInfo = await ethers.provider.getBlock(await ethers.provider.getBlockNumber());
  await timelock.queueTransaction(
    usdtBusdWorkerInfo.address,
    0,
    "setStrategyOk(address[],bool)",
    ethers.utils.defaultAbiCoder.encode(["address[]", "bool"], [[addStableStrat.address], true]),
    lastBlockInfo.timestamp + 86401
  );

  // Change Oracle Price Source to SimplePrice feed
  const oracleMedianizer = OracleMedianizer__factory.connect(config.Oracle.OracleMedianizer, alpacaDeployer);
  await oracleMedianizer.setPrimarySources(usdt.address, busd.address, "1000000000000000000", 86400 * 30, [
    config.Oracle.ChainLinkOracle,
  ]);

  // Move 1 day to be able to execute timelock
  await increase(ethers.BigNumber.from(86402));
  await timelock.executeTransaction(
    usdtBusdWorkerInfo.address,
    0,
    "setStrategyOk(address[],bool)",
    ethers.utils.defaultAbiCoder.encode(["address[]", "bool"], [[addStableStrat.address], true]),
    lastBlockInfo.timestamp + 86401
  );

  expect(await usdtBusdWorker.okStrats(addStableStrat.address)).to.be.eq(true);

  const testCaseUserBalancesIn = [
    [ethers.utils.parseEther("450"), ethers.utils.parseEther("450")],
    [ethers.utils.parseEther("1731"), ethers.utils.parseEther("158")],
    [ethers.utils.parseEther("2000"), ethers.utils.parseEther("1")],
    [ethers.utils.parseEther("3000"), ethers.utils.parseEther("900")],
    [ethers.utils.parseEther("4598"), ethers.utils.parseEther("0")],
    [ethers.utils.parseEther("9999"), ethers.utils.parseEther("9999")],
    [ethers.utils.parseEther("0"), ethers.utils.parseEther("9511")],
    [ethers.utils.parseEther("39850"), ethers.utils.parseEther("7510")],
    [ethers.utils.parseEther("1000000"), ethers.utils.parseEther("1000000")],
    [ethers.utils.parseEther("1524652"), ethers.utils.parseEther("99")],
    [ethers.utils.parseEther("5000000"), ethers.utils.parseEther("0")],
    [ethers.utils.parseEther("1"), ethers.utils.parseEther("5000000")],
    [ethers.utils.parseEther("123"), ethers.utils.parseEther("50000000")],
    [ethers.utils.parseEther("50000000"), ethers.utils.parseEther("321")],
  ];

  await busd.approve(busdVault.address, ethers.constants.MaxUint256);
  await usdt.approve(busdVault.address, ethers.constants.MaxUint256);

  // Deposit to Vault for liquidity
  await busdVault.deposit(ethers.utils.parseEther("500000000"));

  const startBlock = await ethers.provider.getBlockNumber();
  for (let i = 0; i < testCaseUserBalancesIn.length; i++) {
    console.log(`======= TestCase#${i} ========`);
    const testCase = testCaseUserBalancesIn[i];

    let posID = await busdVault.nextPositionID();
    let tx = await busdVault.work(
      0,
      usdtBusdWorker.address,
      testCase[0],
      testCase[0].add(testCase[1]).mul(3).sub(testCase[0]),
      0,
      ethers.utils.defaultAbiCoder.encode(
        ["address", "bytes"],
        [addStableStrat.address, ethers.utils.defaultAbiCoder.encode(["uint256", "uint256"], [testCase[1], 0])]
      )
    );
    let txReceipt = await tx.wait();

    console.log("Gas Used: ", txReceipt.gasUsed.toString());
    console.log("LP: ", (await usdtBusdWorker.shareToBalance(await usdtBusdWorker.shares(posID))).toString());
    console.log("Debris BUSD: ", (await busd.balanceOf(addStableStrat.address)).toString());
    console.log("Debris USDT: ", (await usdt.balanceOf(addStableStrat.address)).toString());
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
