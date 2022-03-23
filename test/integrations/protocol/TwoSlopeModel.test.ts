import { ethers, waffle } from "hardhat";
import { Signer } from "ethers";
import { TwoSlopeModel, TwoSlopeModel__factory } from "../../../typechain";
import * as assertHelpers from "../../helpers/assert";

describe("TwoSlopeModel", () => {
  let twoSlopeModel: TwoSlopeModel;

  let deployer: Signer;

  async function fixture() {
    [deployer] = await ethers.getSigners();

    const TwoSlopeModel = (await ethers.getContractFactory("TwoSlopeModel", deployer)) as TwoSlopeModel__factory;
    twoSlopeModel = await TwoSlopeModel.deploy();
  }

  beforeEach(async () => {
    await waffle.loadFixture(fixture);
  });

  it("should returns ~18.75% APR when utilization 30%", async () => {
    const interestPerSec = await twoSlopeModel.getInterestRate("30", "70");
    const interestPerYear = interestPerSec.mul(60).mul(60).mul(24).mul(365);
    assertHelpers.assertBigNumberClosePercent(interestPerYear, ethers.utils.parseEther("0.1875"));
  });

  it("should returns ~31.25% APR when utilization 50%", async () => {
    const interestPerSec = await twoSlopeModel.getInterestRate("50", "50");
    const interestPerYear = interestPerSec.mul(60).mul(60).mul(24).mul(365);
    assertHelpers.assertBigNumberClosePercent(interestPerYear, ethers.utils.parseEther("0.3125"));
  });

  it("should returns ~50% APR when utilization 80%", async () => {
    const interestPerSec = await twoSlopeModel.getInterestRate("80", "20");
    const interestPerYear = interestPerSec.mul(60).mul(60).mul(24).mul(365);
    assertHelpers.assertBigNumberClosePercent(interestPerYear, ethers.utils.parseEther("0.5"));
  });

  it("should returns ~75% APR when utilization 90%", async () => {
    const interestPerSec = await twoSlopeModel.getInterestRate("90", "10");
    const interestPerYear = interestPerSec.mul(60).mul(60).mul(24).mul(365);
    assertHelpers.assertBigNumberClosePercent(interestPerYear, ethers.utils.parseEther("0.75"));
  });

  it("should returns ~93.75% APR when utilization 97.5%", async () => {
    const interestPerSec = await twoSlopeModel.getInterestRate("975", "25");
    const interestPerYear = interestPerSec.mul(60).mul(60).mul(24).mul(365);
    assertHelpers.assertBigNumberClosePercent(interestPerYear, ethers.utils.parseEther("0.9375"));
  });

  it("should returns ~97.5% APR when utilization 99%", async () => {
    const interestPerSec = await twoSlopeModel.getInterestRate("99", "1");
    const interestPerYear = interestPerSec.mul(60).mul(60).mul(24).mul(365);
    assertHelpers.assertBigNumberClosePercent(interestPerYear, ethers.utils.parseEther("0.975"));
  });

  it("should returns ~100% APR when utilization 100%", async () => {
    const interestPerSec = await twoSlopeModel.getInterestRate("100", "0");
    const interestPerYear = interestPerSec.mul(60).mul(60).mul(24).mul(365);
    assertHelpers.assertBigNumberClosePercent(interestPerYear, ethers.utils.parseEther("1"));
  });
});
