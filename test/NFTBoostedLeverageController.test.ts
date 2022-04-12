import { ethers, upgrades, waffle } from "hardhat";
import { Signer, BigNumber, Bytes } from "ethers";
import chai from "chai";
import { solidity } from "ethereum-waffle";
import "@openzeppelin/test-helpers";
import {
  NFTStaking,
  NFTStaking__factory,
  MockNFT,
  MockNFT__factory,
  PancakePair__factory,
  PancakeFactory,
  PancakeFactory__factory,
  IWETH,
  IWETH__factory,
  ERC20Upgradeable,
  SimplePriceOracle__factory,
  NFTBoostedLeverageController,
  NFTBoostedLeverageController__factory,
} from "../typechain";
import { MockPancakeswapV2Worker } from "../typechain/MockPancakeswapV2Worker";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { MockPancakeswapV2Worker__factory } from "../typechain/factories/MockPancakeswapV2Worker__factory";
import { MockERC20 } from "../typechain/MockERC20";
import { WETH } from "../typechain/WETH";
import { WETH__factory } from "../typechain/factories/WETH__factory";
import { CakeToken } from "../typechain/CakeToken";
import { PancakeRouterV2 } from "../typechain/PancakeRouterV2";
import { PancakeRouterV2__factory } from "../typechain/factories/PancakeRouterV2__factory";
import { WorkerConfig__factory } from "../typechain/factories/WorkerConfig__factory";
import { WorkerConfig } from "../typechain/WorkerConfig";
import { MockERC20__factory } from "../typechain/factories/MockERC20__factory";
import { CakeToken__factory } from "../typechain/factories/CakeToken__factory";
import { SimplePriceOracle } from "../typechain/SimplePriceOracle";

chai.use(solidity);


describe("NFTBoostedLeverageController", () => {
  let nftBoostedLeverageController: NFTBoostedLeverageController;

  /// PancakeswapV2-related instance(s)
  let factoryV2: PancakeFactory;
  let routerV2: PancakeRouterV2;

  /// Token-related instance(s)
  let wbnb: IWETH;
  let baseToken: MockERC20;
  let decimal6: MockERC20;
  let decimal8: MockERC20;
  let cake: CakeToken;

  // NFT
  let nftStaking: NFTStaking;
  let mockNFT: MockNFT;
  let poolId: string[];

  // Worker
  let mockWorker1: MockPancakeswapV2Worker;
  let mockWorker2: MockPancakeswapV2Worker;
  let mockWorker3: MockPancakeswapV2Worker;

  // WorkerConfig instance
  let workerConfig: WorkerConfig;

  // Account
  let deployer: SignerWithAddress;
  let alice: SignerWithAddress;

  /// SimpleOracle-related instance(s)
  let simplePriceOracle: SimplePriceOracle;

  async function fixture() {
    console.log("deploy user");

    [deployer, alice] = await ethers.getSigners();
    // Setup Pancakeswap
    const PancakeFactory = (await ethers.getContractFactory("PancakeFactory", deployer)) as PancakeFactory__factory;
    factoryV2 = await PancakeFactory.deploy(await deployer.getAddress());
    await factoryV2.deployed();

    console.log("deploy simpleoracle");

    /// Deploy SimpleOracle
    const SimplePriceOracle = (await ethers.getContractFactory(
      "SimplePriceOracle",
      deployer
    )) as SimplePriceOracle__factory;
    simplePriceOracle = (await upgrades.deployProxy(SimplePriceOracle, [
      await alice.getAddress(),
    ])) as SimplePriceOracle;
    await simplePriceOracle.deployed();

    const NFTStaking = (await ethers.getContractFactory("NFTStaking", deployer)) as NFTStaking__factory;
    nftStaking = (await upgrades.deployProxy(NFTStaking, [])) as NFTStaking;
    await nftStaking.deployed();

    // Deploy MockNFT
    // Sale will start 1000 blocks from here and another 1000 blocks to reveal
    const MockNFT = (await ethers.getContractFactory("MockNFT", deployer)) as MockNFT__factory;
    mockNFT = (await upgrades.deployProxy(MockNFT, [])) as MockNFT;
    // mockNFT2 = (await upgrades.deployProxy(MockNFT, [])) as MockNFT;
    await mockNFT.deployed();
    // await mockNFT2.deployed();
    // mockNFTAsAlice = MockNFT__factory.connect(mockNFT.address, alice);
    // nftStakingAsAlice = NFTStaking__factory.connect(nftStaking.address, alice);

    console.log("WBNB");

    const WBNB = (await ethers.getContractFactory("WETH", deployer)) as WETH__factory;
    wbnb = (await WBNB.deploy()) as WETH;
    await wbnb.deployed();

    console.log("Pancake router");

    const PancakeRouterV2 = (await ethers.getContractFactory("PancakeRouterV2", deployer)) as PancakeRouterV2__factory;
    routerV2 = await PancakeRouterV2.deploy(factoryV2.address, wbnb.address);
    await routerV2.deployed();

    console.log("worker config");

    // Deploy WorkerConfig
    const WorkerConfig = (await ethers.getContractFactory("WorkerConfig", deployer)) as WorkerConfig__factory;
    workerConfig = (await upgrades.deployProxy(WorkerConfig, [simplePriceOracle.address])) as WorkerConfig;
    await workerConfig.deployed();

    console.log("token");

    // Setup token stuffs
    const MockERC20 = (await ethers.getContractFactory("MockERC20", deployer)) as MockERC20__factory;
    baseToken = (await upgrades.deployProxy(MockERC20, ["BTOKEN", "BTOKEN", 18])) as MockERC20;
    await baseToken.deployed();
    await baseToken.mint(await alice.getAddress(), ethers.utils.parseEther("100"));
    console.log(await baseToken.owner());
    console.log("cakeToken");

    const CakeToken = (await ethers.getContractFactory("CakeToken", deployer)) as CakeToken__factory;
    cake = await CakeToken.deploy();
    await cake.deployed();
    await cake["mint(address,uint256)"](await deployer.getAddress(), ethers.utils.parseEther("100"));
    await cake["mint(address,uint256)"](await alice.getAddress(), ethers.utils.parseEther("10"));
    console.log(cake.address);
    console.log("dec6");

    decimal6 = (await upgrades.deployProxy(MockERC20, ["DEC6", "DEC6", 6])) as MockERC20;
    await decimal6.deployed();
    await decimal6.mint(deployer.address, ethers.utils.parseUnits("88888888", 6));

    console.log("dec8");

    decimal8 = (await upgrades.deployProxy(MockERC20, ["DEC8", "DEC8", 8])) as MockERC20;
    await decimal8.deployed();
    await decimal8.mint(deployer.address, ethers.utils.parseUnits("88888888", 8));

    console.log("create farm");

    const NFTBoostedLeverageController = (await ethers.getContractFactory(
      "NFTBoostedLeverageController",
      deployer
    )) as NFTBoostedLeverageController__factory;
    console.log(NFTBoostedLeverageController.signer.getAddress());
    nftBoostedLeverageController = (await upgrades.deployProxy(
      NFTBoostedLeverageController,
      []
    )) as NFTBoostedLeverageController;
    await nftBoostedLeverageController.deployed();
    console.log(deployer.address);
    console.log(await nftBoostedLeverageController.owner());
    console.log(await nftBoostedLeverageController.address);

    // Create Farm
    await Promise.all([
      factoryV2.createPair(cake.address, wbnb.address),
      factoryV2.createPair(decimal6.address, wbnb.address),
      factoryV2.createPair(decimal8.address, wbnb.address),
      factoryV2.createPair(decimal6.address, decimal8.address),
    ]);

    console.log("create pair");

    const [cakewbnbLp, dec6wbnbLp, dec8wbnbLp, dec8dec6Lp] = await Promise.all([
      PancakePair__factory.connect(await factoryV2.getPair(wbnb.address, cake.address), deployer),
      PancakePair__factory.connect(await factoryV2.getPair(wbnb.address, decimal6.address), deployer),
      PancakePair__factory.connect(await factoryV2.getPair(wbnb.address, decimal8.address), deployer),
      PancakePair__factory.connect(await factoryV2.getPair(decimal8.address, decimal6.address), deployer),
    ]);

    console.log("set up mockworker");

    // Setup MockWorker
    const MockWorker = (await ethers.getContractFactory(
      "MockPancakeswapV2Worker",
      deployer
    )) as MockPancakeswapV2Worker__factory;
    mockWorker1 = (await MockWorker.deploy(cakewbnbLp.address, wbnb.address, cake.address)) as MockPancakeswapV2Worker;
    await mockWorker1.deployed();

    console.log("worker2");
    mockWorker2 = (await MockWorker.deploy(
      dec6wbnbLp.address,
      decimal6.address,
      wbnb.address
    )) as MockPancakeswapV2Worker;
    await mockWorker2.deployed();

    console.log("worker3");

    mockWorker3 = (await MockWorker.deploy(
      dec8wbnbLp.address,
      decimal8.address,
      wbnb.address
    )) as MockPancakeswapV2Worker;
    await mockWorker3.deployed();
  }

  beforeEach(async () => {
    await waffle.loadFixture(fixture);
  });

  describe("#setBoosted", async () => {
    const workFactors = [34, 56, 76];
    const killFactors = [50, 60, 80];
    context("when setBoosted with correct params", async () => {
      it("should success", async () => {
        await nftStaking.addPool(ethers.utils.solidityKeccak256(["string"], ["NFT1"]), [mockNFT.address]);
        await nftStaking.addPool(ethers.utils.solidityKeccak256(["string"], ["NFT2"]), [mockNFT.address]);
        await nftStaking.addPool(ethers.utils.solidityKeccak256(["string"], ["NFT3"]), [mockNFT.address]);
        console.log("add pool success");
        console.log("setpoolfrom contract");
        console.log(await nftBoostedLeverageController.setPoolFromContract());

        const workers = [mockWorker1.address, mockWorker2.address, mockWorker3.address];
        console.log(workers.length, workFactors.length, killFactors.length);
        const x = await nftBoostedLeverageController.setBoosted(workers, workFactors, killFactors);
        console.log(x);
      });
    });
  });
  //   describe("#getBoostedWorkFactor", async () => {
  //     context("getBoostedWorkFacetor", async () => {
  //       it("should success", async () => {
  //         const workers = [mockWorker1.address, mockWorker2.address, mockWorker3.address];
  //         const workFactors = [34, 56, 76];
  //         const killFactors = [50, 60, 80];

  //         await nftBoostedLeverageController.setBoosted(workers, workFactors, killFactors);
  //         await nftBoostedLeverageController.getBoostedWorkFactor(deployer.address, mockWorker2.address);
  //       });
  //     });
  //   });
  //   describe("#getBoostedKillFactor", async () => {
  //     context("getBoostedKillFacetor", async () => {
  //       it("should success", async () => {
  //         const workers = [mockWorker1.address, mockWorker2.address, mockWorker3.address];
  //         const workFactors = [34, 56, 76];
  //         const killFactors = [50, 60, 80];

  //         await nftBoostedLeverageController.setBoosted(workers, workFactors, killFactors);
  //         await nftBoostedLeverageController.getBoostedKillFactor(deployer.address, mockWorker2.address);
  //       });
  //     });
  //   });
});
