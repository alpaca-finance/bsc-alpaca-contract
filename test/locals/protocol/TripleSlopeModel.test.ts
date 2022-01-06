import { ethers, waffle } from "hardhat";
import { Signer } from "ethers";
import "@openzeppelin/test-helpers";
import { TripleSlopeModel, TripleSlopeModel__factory } from "../../../typechain";
import * as TestHelpers from "../../helpers/assert";

describe("TripleSlopeModel", () => {
  let tripleSlopeModel: TripleSlopeModel;

  let deployer: Signer;

  async function fixture() {
    [deployer] = await ethers.getSigners();

    const TripleSlopeModel = (await ethers.getContractFactory(
      "TripleSlopeModel",
      deployer
    )) as TripleSlopeModel__factory;
    tripleSlopeModel = await TripleSlopeModel.deploy();
  }

  beforeEach(async () => {
    await waffle.loadFixture(fixture);
  });

  it("should returns ~10% APR when utilization 30%", async () => {
    const interestPerSec = await tripleSlopeModel.getInterestRate("30", "70");
    const interestPerYear = interestPerSec.mul(60).mul(60).mul(24).mul(365);
    TestHelpers.assertAlmostEqual(interestPerYear.toString(), ethers.utils.parseEther("0.10").toString());
  });

  it("should returns ~16.67% APR when utilization 50%", async () => {
    const interestPerSec = await tripleSlopeModel.getInterestRate("50", "50");
    const interestPerYear = interestPerSec.mul(60).mul(60).mul(24).mul(365);
    TestHelpers.assertAlmostEqual(interestPerYear.toString(), ethers.utils.parseEther("0.166666667").toString());
  });

  it("should returns ~20% APR when utilization 89%", async () => {
    const interestPerSec = await tripleSlopeModel.getInterestRate("89", "11");
    const interestPerYear = interestPerSec.mul(60).mul(60).mul(24).mul(365);
    TestHelpers.assertAlmostEqual(interestPerYear.toString(), ethers.utils.parseEther("0.20").toString());
  });

  it("should returns ~85% APR when utilization 95%", async () => {
    const interestPerSec = await tripleSlopeModel.getInterestRate("95", "5");
    const interestPerYear = interestPerSec.mul(60).mul(60).mul(24).mul(365);
    TestHelpers.assertAlmostEqual(interestPerYear.toString(), ethers.utils.parseEther("0.85").toString());
  });

  it("should returns ~117.5% APR when utilization 97.5%", async () => {
    const interestPerSec = await tripleSlopeModel.getInterestRate("975", "25");
    const interestPerYear = interestPerSec.mul(60).mul(60).mul(24).mul(365);
    TestHelpers.assertAlmostEqual(interestPerYear.toString(), ethers.utils.parseEther("1.175").toString());
  });

  it("should returns ~137% APR when utilization 99%", async () => {
    const interestPerSec = await tripleSlopeModel.getInterestRate("99", "1");
    const interestPerYear = interestPerSec.mul(60).mul(60).mul(24).mul(365);
    TestHelpers.assertAlmostEqual(interestPerYear.toString(), ethers.utils.parseEther("1.37").toString());
  });

  it("should returns ~150% APR when utilization 100%", async () => {
    const interestPerSec = await tripleSlopeModel.getInterestRate("100", "0");
    const interestPerYear = interestPerSec.mul(60).mul(60).mul(24).mul(365);
    TestHelpers.assertAlmostEqual(interestPerYear.toString(), ethers.utils.parseEther("1.5").toString());
  });
});
