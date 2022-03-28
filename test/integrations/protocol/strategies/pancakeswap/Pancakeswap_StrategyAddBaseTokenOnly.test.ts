import { ethers, network, upgrades, waffle } from "hardhat";
import { Signer, BigNumberish, utils, Wallet } from "ethers";
import chai from "chai";
import { solidity } from "ethereum-waffle";
import "@openzeppelin/test-helpers";
import {
  MockERC20,
  MockERC20__factory,
  PancakeFactory,
  PancakeFactory__factory,
  PancakePair,
  PancakePair__factory,
  PancakeRouter,
  PancakeRouter__factory,
  StrategyAddBaseTokenOnly,
  StrategyAddBaseTokenOnly__factory,
  WETH,
  WETH__factory,
} from "../../../../../typechain";

chai.use(solidity);
const { expect } = chai;

describe("Pancakeswap - StrategyAddBaseTokenOnly", () => {
  const FOREVER = "2000000000";

  /// Pancakeswap-related instance(s)
  let factory: PancakeFactory;
  let router: PancakeRouter;
  let lp: PancakePair;

  /// Token-related instance(s)
  let wbnb: WETH;
  let baseToken: MockERC20;
  let farmingToken: MockERC20;

  /// Strategy-ralted instance(s)
  let strat: StrategyAddBaseTokenOnly;

  // Accounts
  let deployer: Signer;
  let alice: Signer;
  let bob: Signer;

  // Contract Signer
  let baseTokenAsAlice: MockERC20;
  let baseTokenAsBob: MockERC20;

  let lpAsAlice: PancakePair;
  let lpAsBob: PancakePair;

  let farmingTokenAsAlice: MockERC20;
  let farmingTokenAsBob: MockERC20;

  let routerAsAlice: PancakeRouter;
  let routerAsBob: PancakeRouter;

  let stratAsAlice: StrategyAddBaseTokenOnly;
  let stratAsBob: StrategyAddBaseTokenOnly;

  async function fixture() {
    [deployer, alice, bob] = await ethers.getSigners();

    // Setup Pancakeswap
    const PancakeFactory = (await ethers.getContractFactory("PancakeFactory", deployer)) as PancakeFactory__factory;
    factory = await PancakeFactory.deploy(await deployer.getAddress());
    await factory.deployed();

    const WBNB = (await ethers.getContractFactory("WETH", deployer)) as WETH__factory;
    wbnb = await WBNB.deploy();
    await factory.deployed();

    const PancakeRouter = (await ethers.getContractFactory("PancakeRouter", deployer)) as PancakeRouter__factory;
    router = await PancakeRouter.deploy(factory.address, wbnb.address);
    await router.deployed();

    /// Setup token stuffs
    const MockERC20 = (await ethers.getContractFactory("MockERC20", deployer)) as MockERC20__factory;
    baseToken = (await upgrades.deployProxy(MockERC20, ["BTOKEN", "BTOKEN", 18])) as MockERC20;
    await baseToken.deployed();
    await baseToken.mint(await alice.getAddress(), ethers.utils.parseEther("100"));
    await baseToken.mint(await bob.getAddress(), ethers.utils.parseEther("100"));
    farmingToken = (await upgrades.deployProxy(MockERC20, ["FTOKEN", "FTOKEN", 18])) as MockERC20;
    await farmingToken.deployed();
    await farmingToken.mint(await alice.getAddress(), ethers.utils.parseEther("10"));
    await farmingToken.mint(await bob.getAddress(), ethers.utils.parseEther("10"));

    await factory.createPair(baseToken.address, farmingToken.address);

    lp = PancakePair__factory.connect(await factory.getPair(farmingToken.address, baseToken.address), deployer);

    const StrategyAddBaseTokenOnly = (await ethers.getContractFactory(
      "StrategyAddBaseTokenOnly",
      deployer
    )) as StrategyAddBaseTokenOnly__factory;
    strat = (await upgrades.deployProxy(StrategyAddBaseTokenOnly, [router.address])) as StrategyAddBaseTokenOnly;
    await strat.deployed();

    // Assign contract signer
    baseTokenAsAlice = MockERC20__factory.connect(baseToken.address, alice);
    baseTokenAsBob = MockERC20__factory.connect(baseToken.address, bob);

    farmingTokenAsAlice = MockERC20__factory.connect(farmingToken.address, alice);
    farmingTokenAsBob = MockERC20__factory.connect(farmingToken.address, bob);

    routerAsAlice = PancakeRouter__factory.connect(router.address, alice);
    routerAsBob = PancakeRouter__factory.connect(router.address, bob);

    lpAsAlice = PancakePair__factory.connect(lp.address, alice);
    lpAsBob = PancakePair__factory.connect(lp.address, bob);

    stratAsAlice = StrategyAddBaseTokenOnly__factory.connect(strat.address, alice);
    stratAsBob = StrategyAddBaseTokenOnly__factory.connect(strat.address, bob);
  }

  beforeEach(async () => {
    await waffle.loadFixture(fixture);
  });

  it("should revert on bad calldata", async () => {
    // Bob passes some bad calldata that can't be decoded
    await expect(stratAsBob.execute(await bob.getAddress(), "0", "0x1234")).to.be.reverted;
  });

  it("should convert all BTOKEN to LP tokens at best rate", async () => {
    // Alice adds 0.1 FTOKEN + 1 WBTC
    await farmingTokenAsAlice.approve(router.address, ethers.utils.parseEther("0.1"));
    await baseTokenAsAlice.approve(router.address, ethers.utils.parseEther("1"));

    // Add liquidity to the WBTC-FTOKEN pool on Pancakeswap
    await routerAsAlice.addLiquidity(
      baseToken.address,
      farmingToken.address,
      ethers.utils.parseEther("1"),
      ethers.utils.parseEther("0.1"),
      "0",
      "0",
      await alice.getAddress(),
      FOREVER
    );

    // Bob transfer 0.1 WBTC to StrategyAddBaseTokenOnly first
    await baseTokenAsBob.transfer(strat.address, ethers.utils.parseEther("0.1"));
    // Bob uses AddBaseTokenOnly strategy to add 0.1 WBTC
    await stratAsBob.execute(
      await bob.getAddress(),
      "0",
      ethers.utils.defaultAbiCoder.encode(
        ["address", "address", "uint256"],
        [baseToken.address, farmingToken.address, "0"]
      )
    );

    expect(await lp.balanceOf(await bob.getAddress())).to.be.eq(ethers.utils.parseEther("0.015419263215025115"));
    expect(await lp.balanceOf(strat.address)).to.be.eq(ethers.utils.parseEther("0"));
    expect(await farmingToken.balanceOf(strat.address)).to.be.eq(ethers.utils.parseEther("0"));

    // Bob uses AddBaseTokenOnly strategy to add another 0.1 WBTC
    await baseTokenAsBob.transfer(strat.address, ethers.utils.parseEther("0.1"));
    await lpAsBob.transfer(strat.address, ethers.utils.parseEther("0.015419263215025115"));
    await stratAsBob.execute(
      await bob.getAddress(),
      "0",
      ethers.utils.defaultAbiCoder.encode(
        ["address", "address", "uint256"],
        [baseToken.address, farmingToken.address, ethers.utils.parseEther("0.01")]
      )
    );

    expect(await lp.balanceOf(await bob.getAddress())).to.be.eq(ethers.utils.parseEther("0.030151497260262730"));
    expect(await lp.balanceOf(strat.address)).to.be.eq(ethers.utils.parseEther("0"));
    expect(await farmingToken.balanceOf(strat.address)).to.be.eq(ethers.utils.parseEther("0"));

    // Bob uses AddBaseTokenOnly strategy yet again, but now with an unreasonable min LP request
    await baseTokenAsBob.transfer(strat.address, ethers.utils.parseEther("0.1"));
    await expect(
      stratAsBob.execute(
        await bob.getAddress(),
        "0",
        ethers.utils.defaultAbiCoder.encode(
          ["address", "address", "uint256"],
          [baseToken.address, farmingToken.address, ethers.utils.parseEther("0.05")]
        )
      )
    ).to.be.revertedWith("insufficient LP tokens received");
  });
});
