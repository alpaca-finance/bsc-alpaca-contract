import { ethers, upgrades, waffle } from "hardhat";
import chai from "chai";
import { solidity } from "ethereum-waffle";
import {
  NFTStaking,
  NFTStaking__factory,
  MockNFT,
  MockNFT__factory,
  PancakePair__factory,
  PancakeFactory,
  PancakeFactory__factory,
  PancakeRouterV2,
  PancakeRouterV2__factory,
  CakeToken,
  CakeToken__factory,
  WorkerConfig,
  WorkerConfig__factory,
  IWETH,
  WETH,
  WETH__factory,
  SimplePriceOracle,
  SimplePriceOracle__factory,
  NFTBoostedLeverageController,
  NFTBoostedLeverageController__factory,
  MockERC20,
  MockERC20__factory,
  MockPancakeswapV2Worker,
  MockPancakeswapV2Worker__factory,
} from "../typechain";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signer-with-address";

chai.use(solidity);
const { expect } = chai;

describe("NFTBoostedLeverageController", () => {
  // NFTBoostedLeverage
  let nftBoostedLeverageController: NFTBoostedLeverageController;

  // PancakeswapV2-related instance(s)
  let factoryV2: PancakeFactory;
  let routerV2: PancakeRouterV2;

  // Token-related instance(s)
  let wbnb: IWETH;
  let baseToken: MockERC20;
  let decimal6: MockERC20;
  let decimal8: MockERC20;
  let cake: CakeToken;

  // NFT
  let nftStaking: NFTStaking;
  let nftStakingAsAlice: NFTStaking;

  // MockNFT
  let mockNFT: MockNFT;
  let mockNFT2: MockNFT;
  let mockNFTAsAlice: MockNFT;
  let mockNFTAsAlice2: MockNFT;

  // Worker
  let mockWorker1: MockPancakeswapV2Worker;
  let mockWorker2: MockPancakeswapV2Worker;
  let mockWorker3: MockPancakeswapV2Worker;

  // WorkerConfig instance
  let workerConfig: WorkerConfig;

  // SimpleOracle-related instance(s)
  let simplePriceOracle: SimplePriceOracle;

  // Account
  let deployer: SignerWithAddress;
  let alice: SignerWithAddress;

  async function fixture() {
    [deployer, alice] = await ethers.getSigners();

    // Cake
    const CakeToken = (await ethers.getContractFactory("CakeToken", deployer)) as CakeToken__factory;
    cake = await CakeToken.deploy();
    await cake.deployed();
    await cake["mint(address,uint256)"](await deployer.getAddress(), ethers.utils.parseEther("100"));
    await cake["mint(address,uint256)"](await alice.getAddress(), ethers.utils.parseEther("10"));

    // WBNB
    const WBNB = (await ethers.getContractFactory("WETH", deployer)) as WETH__factory;
    wbnb = (await WBNB.deploy()) as WETH;
    await wbnb.deployed();

    // Setup Pancakeswap
    const PancakeFactory = (await ethers.getContractFactory("PancakeFactory", deployer)) as PancakeFactory__factory;
    factoryV2 = await PancakeFactory.deploy(await deployer.getAddress());
    await factoryV2.deployed();

    const PancakeRouterV2 = (await ethers.getContractFactory("PancakeRouterV2", deployer)) as PancakeRouterV2__factory;
    routerV2 = await PancakeRouterV2.deploy(factoryV2.address, wbnb.address);
    await routerV2.deployed();

    // Deploy SimpleOracle
    const SimplePriceOracle = (await ethers.getContractFactory(
      "SimplePriceOracle",
      deployer
    )) as SimplePriceOracle__factory;
    simplePriceOracle = (await upgrades.deployProxy(SimplePriceOracle, [
      await alice.getAddress(),
    ])) as SimplePriceOracle;
    await simplePriceOracle.deployed();

    // Deploy WorkerConfig
    const WorkerConfig = (await ethers.getContractFactory("WorkerConfig", deployer)) as WorkerConfig__factory;
    workerConfig = (await upgrades.deployProxy(WorkerConfig, [simplePriceOracle.address])) as WorkerConfig;
    await workerConfig.deployed();

    // Deploy NFTStaking
    const NFTStaking = (await ethers.getContractFactory("NFTStaking", deployer)) as NFTStaking__factory;
    nftStaking = (await upgrades.deployProxy(NFTStaking, [])) as NFTStaking;
    await nftStaking.deployed();
    nftStakingAsAlice = NFTStaking__factory.connect(nftStaking.address, alice);

    // Deploy MockNFT
    const MockNFT = (await ethers.getContractFactory("MockNFT", deployer)) as MockNFT__factory;
    mockNFT = (await upgrades.deployProxy(MockNFT, [])) as MockNFT;
    mockNFT2 = (await upgrades.deployProxy(MockNFT, [])) as MockNFT;
    await mockNFT.deployed();
    await mockNFT2.deployed();
    mockNFTAsAlice = MockNFT__factory.connect(mockNFT.address, alice);
    mockNFTAsAlice2 = MockNFT__factory.connect(mockNFT2.address, alice);

    // Setup token stuffs
    const MockERC20 = (await ethers.getContractFactory("MockERC20", deployer)) as MockERC20__factory;
    baseToken = (await upgrades.deployProxy(MockERC20, ["BTOKEN", "BTOKEN", 18])) as MockERC20;
    await baseToken.deployed();
    await baseToken.mint(await alice.getAddress(), ethers.utils.parseEther("100"));

    decimal6 = (await upgrades.deployProxy(MockERC20, ["DEC6", "DEC6", 6])) as MockERC20;
    await decimal6.deployed();
    await decimal6.mint(deployer.address, ethers.utils.parseUnits("88888888", 6));

    decimal8 = (await upgrades.deployProxy(MockERC20, ["DEC8", "DEC8", 8])) as MockERC20;
    await decimal8.deployed();
    await decimal8.mint(deployer.address, ethers.utils.parseUnits("88888888", 8));

    // Deplot NFTBoostedLeverageController
    const NFTBoostedLeverageController = (await ethers.getContractFactory(
      "NFTBoostedLeverageController",
      deployer
    )) as NFTBoostedLeverageController__factory;
    nftBoostedLeverageController = (await upgrades.deployProxy(NFTBoostedLeverageController, [
      nftStaking.address,
    ])) as NFTBoostedLeverageController;
    await nftBoostedLeverageController.deployed();

    // Create Farm
    await Promise.all([
      factoryV2.createPair(cake.address, wbnb.address),
      factoryV2.createPair(decimal6.address, wbnb.address),
      factoryV2.createPair(decimal8.address, wbnb.address),
    ]);

    const [cakewbnbLp, dec6wbnbLp, dec8wbnbLp] = await Promise.all([
      PancakePair__factory.connect(await factoryV2.getPair(wbnb.address, cake.address), deployer),
      PancakePair__factory.connect(await factoryV2.getPair(wbnb.address, decimal6.address), deployer),
      PancakePair__factory.connect(await factoryV2.getPair(wbnb.address, decimal8.address), deployer),
    ]);

    // Setup MockWorker
    const MockWorker = (await ethers.getContractFactory(
      "MockPancakeswapV2Worker",
      deployer
    )) as MockPancakeswapV2Worker__factory;
    mockWorker1 = (await MockWorker.deploy(cakewbnbLp.address, wbnb.address, cake.address)) as MockPancakeswapV2Worker;
    await mockWorker1.deployed();

    mockWorker2 = (await MockWorker.deploy(
      dec6wbnbLp.address,
      decimal6.address,
      wbnb.address
    )) as MockPancakeswapV2Worker;
    await mockWorker2.deployed();

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
    const poolId1 = ethers.utils.solidityKeccak256(["string"], ["NFT1"]);
    const poolId2 = ethers.utils.solidityKeccak256(["string"], ["NFT2"]);
    const poolId3 = ethers.utils.solidityKeccak256(["string"], ["NFT3"]);

    const workFactors = [34, 56, 76];
    const killFactors = [50, 60, 80];
    context("when setBoosted with correct params", async () => {
      it("should success", async () => {
        await nftStaking.addPool(poolId1, [mockNFT.address], 50);
        await nftStaking.addPool(poolId2, [mockNFT.address], 100);
        await nftStaking.addPool(poolId3, [mockNFT.address], 150);

        const pools = [poolId1, poolId2, poolId3];
        const workers = [mockWorker1.address, mockWorker2.address, mockWorker3.address];

        await nftBoostedLeverageController.setBoosted(pools, workers, workFactors, killFactors);
      });
    });

    context("when setBoosted with bad params", async () => {
      it("should revert", async () => {
        await nftStaking.addPool(poolId1, [mockNFT.address], 50);
        await nftStaking.addPool(poolId2, [mockNFT.address], 100);
        await nftStaking.addPool(poolId3, [mockNFT.address], 150);

        const pools = [poolId1, poolId2, poolId3];
        const workers = [mockWorker1.address, mockWorker2.address];

        await expect(
          nftBoostedLeverageController.setBoosted(pools, workers, workFactors, killFactors)
        ).to.be.revertedWith("NFTBoostedLeverageController_BadParamsLength()");
      });
    });
  });

  describe("#getBoostedWorkFactor", async () => {
    const poolId1 = ethers.utils.solidityKeccak256(["string"], ["NFT1"]);
    const poolId2 = ethers.utils.solidityKeccak256(["string"], ["NFT2"]);
    const poolId3 = ethers.utils.solidityKeccak256(["string"], ["NFT3"]);
    context("getBoostedWorkFacetor", async () => {
      it("should success", async () => {
        await nftStaking.addPool(poolId1, [mockNFT.address], 50);
        await nftStaking.addPool(poolId2, [mockNFT.address], 100);
        await nftStaking.addPool(poolId3, [mockNFT.address], 150);
        await mockNFTAsAlice.mint(1);
        await mockNFTAsAlice.approve(nftStakingAsAlice.address, 0);
        await nftStakingAsAlice.stakeNFT(poolId1, mockNFTAsAlice.address, 0);

        const workers = [mockWorker1.address, mockWorker2.address, mockWorker3.address];
        const workFactors = [34, 56, 76];
        const killFactors = [50, 60, 80];

        const pools = [poolId1, poolId2, poolId3];
        await nftBoostedLeverageController.setBoosted(pools, workers, workFactors, killFactors);
        const boostedWorkFactor = await nftBoostedLeverageController.getBoostedWorkFactor(
          alice.address,
          mockWorker1.address
        );
        expect(boostedWorkFactor).to.be.eq(34);
      });
    });

    context("getBoostedWorkFactor that does not exist", async () => {
      it("should revert", async () => {
        await nftStaking.addPool(poolId1, [mockNFT.address], 50);
        await nftStaking.addPool(poolId2, [mockNFT.address], 100);
        await mockNFTAsAlice.mint(1);
        await mockNFTAsAlice.approve(nftStakingAsAlice.address, 0);
        await nftStakingAsAlice.stakeNFT(poolId1, mockNFTAsAlice.address, 0);

        const workers = [mockWorker1.address, mockWorker2.address];
        const workFactors = [34, 56];
        const killFactors = [50, 60];

        const pools = [poolId1, poolId2];
        await nftBoostedLeverageController.setBoosted(pools, workers, workFactors, killFactors);
        const boostedWorkFactor = await nftBoostedLeverageController.getBoostedWorkFactor(
          alice.address,
          mockWorker3.address
        );
        expect(boostedWorkFactor).to.be.eq(0);
      });
    });

    context("getBoostedWorkFactor from the highest weight", async () => {
      it("should success", async () => {
        await nftStaking.addPool(poolId1, [mockNFTAsAlice.address], 50);
        await mockNFTAsAlice.mint(1);
        await mockNFTAsAlice.approve(nftStakingAsAlice.address, 0);
        await nftStakingAsAlice.stakeNFT(poolId1, mockNFTAsAlice.address, 0);

        await nftStaking.addPool(poolId2, [mockNFTAsAlice2.address], 100);
        await mockNFTAsAlice2.mint(1);
        await mockNFTAsAlice2.approve(nftStakingAsAlice.address, 0);
        await nftStakingAsAlice.stakeNFT(poolId2, mockNFTAsAlice2.address, 0);

        const workers = [mockWorker1.address, mockWorker2.address, mockWorker1.address];
        const workFactors = [34, 56, 70];
        const killFactors = [50, 60, 80];
        const pools = [poolId1, poolId1, poolId2];
        await nftBoostedLeverageController.setBoosted(pools, workers, workFactors, killFactors);
        const boostedWorkFactor = await nftBoostedLeverageController.getBoostedWorkFactor(
          alice.address,
          mockWorker1.address
        );
        expect(boostedWorkFactor).to.be.eq(70);
      });
    });
  });

  describe("#getBoostedKillFactor", async () => {
    const poolId1 = ethers.utils.solidityKeccak256(["string"], ["NFT1"]);
    const poolId2 = ethers.utils.solidityKeccak256(["string"], ["NFT2"]);
    const poolId3 = ethers.utils.solidityKeccak256(["string"], ["NFT3"]);

    context("getBoostedKillFacetor", async () => {
      it("should success", async () => {
        await nftStaking.addPool(poolId1, [mockNFT.address], 50);
        await nftStaking.addPool(poolId2, [mockNFT.address], 100);
        await nftStaking.addPool(poolId3, [mockNFT.address], 150);
        await mockNFTAsAlice.mint(1);
        await mockNFTAsAlice.approve(nftStakingAsAlice.address, 0);
        await nftStakingAsAlice.stakeNFT(poolId1, mockNFTAsAlice.address, 0);

        const workers = [mockWorker1.address, mockWorker2.address, mockWorker3.address];
        const workFactors = [34, 56, 76];
        const killFactors = [50, 60, 80];
        const pools = [poolId1, poolId2, poolId3];
        await nftBoostedLeverageController.setBoosted(pools, workers, workFactors, killFactors);
        const boostedKillFactor = await nftBoostedLeverageController.getBoostedKillFactor(
          alice.address,
          mockWorker1.address
        );
        expect(boostedKillFactor).to.be.eq(50);
      });
    });

    context("getBoostedKillFactor that does not exist", async () => {
      it("should revert", async () => {
        await nftStaking.addPool(poolId1, [mockNFT.address], 50);
        await nftStaking.addPool(poolId2, [mockNFT.address], 100);
        await mockNFTAsAlice.mint(1);
        await mockNFTAsAlice.approve(nftStakingAsAlice.address, 0);
        await nftStakingAsAlice.stakeNFT(poolId1, mockNFTAsAlice.address, 0);

        const workers = [mockWorker1.address, mockWorker2.address];
        const workFactors = [34, 56];
        const killFactors = [50, 60];
        const pools = [poolId1, poolId2];

        await nftBoostedLeverageController.setBoosted(pools, workers, workFactors, killFactors);
        const boostedWorkFactor = await nftBoostedLeverageController.getBoostedKillFactor(
          alice.address,
          mockWorker3.address
        );
        expect(boostedWorkFactor).to.be.eq(0);
      });
    });

    context("getBoostedKillFactor from the highest weight", async () => {
      it("should success", async () => {
        await nftStaking.addPool(poolId1, [mockNFTAsAlice.address], 50);
        await mockNFTAsAlice.mint(1);
        await mockNFTAsAlice.approve(nftStakingAsAlice.address, 0);
        await nftStakingAsAlice.stakeNFT(poolId1, mockNFTAsAlice.address, 0);

        await nftStaking.addPool(poolId2, [mockNFTAsAlice2.address], 100);
        await mockNFTAsAlice2.mint(1);
        await mockNFTAsAlice2.approve(nftStakingAsAlice.address, 0);
        await nftStakingAsAlice.stakeNFT(poolId2, mockNFTAsAlice2.address, 0);

        const workers = [mockWorker1.address, mockWorker2.address, mockWorker1.address];
        const workFactors = [34, 56, 70];
        const killFactors = [50, 60, 80];
        const pools = [poolId1, poolId1, poolId2];
        await nftBoostedLeverageController.setBoosted(pools, workers, workFactors, killFactors);
        const boostedKillFactor = await nftBoostedLeverageController.getBoostedKillFactor(
          alice.address,
          mockWorker1.address
        );
        expect(boostedKillFactor).to.be.eq(80);
      });
    });
  });
});
