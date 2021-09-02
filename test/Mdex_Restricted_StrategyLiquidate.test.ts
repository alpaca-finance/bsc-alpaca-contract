import { ethers, upgrades, waffle } from "hardhat";
import { Signer, BigNumberish, utils, Wallet } from "ethers";
import chai from "chai";
import { solidity } from "ethereum-waffle";
import "@openzeppelin/test-helpers";
import { MdexFactory, MdexFactory__factory, MdexPair, MdexPair__factory,MdexRestrictedStrategyLiquidate, MdexRestrictedStrategyLiquidate__factory, MdexRouter, MdexRouter__factory, MockERC20, MockERC20__factory, MockMdexWorker, MockMdexWorker__factory, WETH, WETH__factory } from "../typechain";
import { deploy } from "@openzeppelin/hardhat-upgrades/dist/utils";

chai.use(solidity);
const { expect } = chai;

const FOREVER = "2000000000";

describe("MdexRestricted_StrategyLiquidate",()=>{

// FIXME do declare variable
    let factory: MdexFactory;
    let router: MdexRouter;
    let mdexPair: MdexPair;
    
    let wbnb : WETH;
    let baseToken: MockERC20;
    let farmingToken : MockERC20; 
    let mdexToken : MockERC20;

    let mockMdexWorker : MockMdexWorker;
    let mockMdexEvilWorker : MockMdexWorker;
    
    let strat : MdexRestrictedStrategyLiquidate;

// initial Contract Signer part
    let deployer: Signer
    let alice: Signer
    let bob: Signer

    let baseTokenAsAlice : MockERC20;
    let baseTokenAsBob : MockERC20;

    let farmingTokenAsAlice: MockERC20;
    let farmingTokenAsBob: MockERC20;

    let wbnbTokenAsAlice: WETH;

    let routerAsAlice: MdexRouter;
    let routerAsBob: MdexRouter;

    let stratAsAlice : MdexRestrictedStrategyLiquidate;
    let stratAsBob : MdexRestrictedStrategyLiquidate;


    let mockMdexWorkerAsBob : MockMdexWorker;
    let mockMdexEvilWorkerAsBob : MockMdexWorker;


    async function fixture(){
    //FIXME do initial stuff
     [deployer,alice,bob] = await ethers.getSigners();

    const MdexFactory = (await ethers.getContractFactory("MdexFactory",deployer)) as MdexFactory__factory;
    factory = await MdexFactory.deploy(await deployer.getAddress());
    await factory.deployed();

    const WBNB = (await ethers.getContractFactory("WETH",deployer)) as WETH__factory;
    wbnb = await WBNB.deploy();
    await wbnb.deployed();

    const MdexRouter = (await ethers.getContractFactory("MdexRouter",deployer)) as MdexRouter__factory;
    router = await MdexRouter.deploy(factory.address,wbnb.address)
    await router.deployed()

    const MockERC20 = (await ethers.getContractFactory("MockERC20",deployer)) as MockERC20__factory;
    baseToken = (await upgrades.deployProxy(MockERC20, ["BTOKEN", "BTOKEN"])) as MockERC20;
    await baseToken.deployed();

    farmingToken = (await upgrades.deployProxy(MockERC20,["FTOKEN","FTOKEN"])) as MockERC20;
    await farmingToken.deployed();

    mdexToken = (await upgrades.deployProxy(MockERC20,["MTOKEN","MTOKEN"])) as MockERC20;
    await mdexToken.deployed();

    // mint to alice and bob 100 BToken
    await baseToken.mint(await alice.getAddress(),ethers.utils.parseEther("100"))
    await baseToken.mint(await bob.getAddress(),ethers.utils.parseEther("100"))
    //farming token 10 token
    await farmingToken.mint(await alice.getAddress(),ethers.utils.parseEther("10"))
    await farmingToken.mint(await bob.getAddress(),ethers.utils.parseEther("10"))

    //create pair
    await factory.createPair(baseToken.address,farmingToken.address)

    // create LP for using at worker
    mdexPair = MdexPair__factory.connect(await factory.getPair(baseToken.address,farmingToken.address),deployer)
    
    const MockMdexWorker = (await ethers.getContractFactory("MockMdexWorker",deployer)) as MockMdexWorker__factory;

    mockMdexWorker = (await MockMdexWorker.deploy(
        mdexPair.address,
        baseToken.address,
        farmingToken.address
    )) as MockMdexWorker;

    await mockMdexWorker.deployed();

    mockMdexEvilWorker = (await MockMdexWorker.deploy(
        mdexPair.address,
        baseToken.address,
        farmingToken.address
    )) as MockMdexWorker;

    await mockMdexEvilWorker.deployed();

    const MdexRestrictedStrategyLiquidate = (await ethers.getContractFactory("MdexRestrictedStrategyLiquidate",deployer))as MdexRestrictedStrategyLiquidate__factory;
    strat = (await upgrades.deployProxy(MdexRestrictedStrategyLiquidate, [router.address,mdexToken.address])) as 
    MdexRestrictedStrategyLiquidate;
    
    await strat.deployed();
    await strat.setWorkersOk([mockMdexWorker.address],true);

    stratAsAlice = MdexRestrictedStrategyLiquidate__factory.connect(strat.address,alice);
    stratAsBob = MdexRestrictedStrategyLiquidate__factory.connect(strat.address,bob);

    baseTokenAsAlice = MockERC20__factory.connect(baseToken.address,alice)
    baseTokenAsBob = MockERC20__factory.connect(baseToken.address,bob)

    farmingTokenAsAlice = MockERC20__factory.connect(farmingToken.address,alice)
    farmingTokenAsBob = MockERC20__factory.connect(farmingToken.address,bob)

    mockMdexWorkerAsBob = MockMdexWorker__factory.connect(mockMdexEvilWorker.address,bob);
    mockMdexEvilWorkerAsBob = MockMdexWorker__factory.connect(mockMdexEvilWorker.address,bob);

    }

    beforeEach(async () => {
        await waffle.loadFixture(fixture);
      });

    context("When bad calldata", async () => {
    it("should revert", async () => {
        await expect(stratAsBob.execute(await bob.getAddress(),"0","0x1234")).to.be.reverted;
     });
    });

    context("When the setOkWorkers caller is not an owner", async () => {
      it("should be reverted", async () => {
        await expect(stratAsBob.setWorkersOk([mockMdexEvilWorkerAsBob.address], true)).to.reverted;
      });
    });

    context("When non-workers call strat", async ()=> {
      it("should revert", async ()=> {
        await expect(stratAsBob.execute(await bob.getAddress(),"0",ethers.utils.defaultAbiCoder.encode(["uint256"], ["0"]))).to.be.reverted;
      })
    })

    context("When caller worker hasn't been whitelisted", async () => {
      it("should revert as bad worker", async () => {
        // transfer to evil contract and use evilContract to work
        await baseTokenAsBob.transfer(mockMdexEvilWorkerAsBob.address, ethers.utils.parseEther("0.05"));

        await expect(
      mockMdexEvilWorkerAsBob.work(0, await bob.getAddress(), "0", ethers.utils.defaultAbiCoder.encode(
        ["address","bytes"],[strat.address, ethers.utils.defaultAbiCoder.encode(["uint256"], [ethers.utils.parseEther("0.05")])]
      ))).to.be.revertedWith("MdexRestrictedStrategyLiquidate::onlyWhitelistedWorkers:: bad worker");
      
      });
    });

    context("When revode whitelist worker", async () => {
      it("should revertas bad worker", async() => {
        await strat.setWorkersOk([mockMdexWorker.address],false);
        await expect(
          mockMdexWorkerAsBob.work(
            0,
            await bob.getAddress(),
            "0",
            ethers.utils.defaultAbiCoder.encode(
              ["address", "bytes"],
              [strat.address, ethers.utils.defaultAbiCoder.encode(["uint256"], [ethers.utils.parseEther("0.05")])]
            )
          )
        ).to.be.revertedWith("MdexRestrictedStrategyLiquidate::onlyWhitelistedWorkers:: bad worker")

      }) 
    })

    context("When apply liquite strategy", async ()=> {
        it("should convert all LP token back to ", async() => {
          await baseTokenAsAlice.approve(router.address,ethers.utils.parseEther("1"));
          await farmingTokenAsAlice.approve(router.address,ethers.utils.parseEther("0.1"))
          await router.addLiquidity(
            baseToken.address,
            farmingToken.address,
            ethers.utils.parseEther("1"),
            ethers.utils.parseEther("0.1"),
            "0",
            "0",
            await alice.getAddress(),
            FOREVER
          )

          // await baseTokenAsBob.approve(router.address,ethers.utils.parseEther("1"));
          // await baseTokenAsBob.approve(router.address,ethers.utils.parseEther("0.1"))
          // await router.addLiquidity(
          //   baseToken.address,
          //   farmingToken.address,
          //   ethers.utils.parseEther("1"),
          //   ethers.utils.parseEther("0.1"),
          //   "0",
          //   "0",
          //   await bob.getAddress(),
          //   FOREVER
          // )

          // expect(await baseToken.balanceOf(await alice.getAddress())).to.be.bignumber.eq(ethers.utils.parseEther("99"))




        })
    })
    




})