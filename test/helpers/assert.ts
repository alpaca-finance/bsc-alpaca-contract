import chai from "chai";
import { solidity } from "ethereum-waffle";
import { BigNumber, ethers } from "ethers";

chai.use(solidity);
const { expect, assert } = chai;

export function assertAlmostEqual(expected: string, actual: string) {
  const expectedBN = BigNumber.from(expected);
  const actualBN = BigNumber.from(actual);
  const diffBN = expectedBN.gt(actualBN) ? expectedBN.sub(actualBN) : actualBN.sub(expectedBN);
  const tolerance = expectedBN.div(BigNumber.from("10000"));
  return expect(diffBN, `${actual} is not almost eqaual to ${expected}`).to.be.lte(tolerance);
}

export function assertBigNumberClosePercent(
  a: ethers.BigNumberish,
  b: ethers.BigNumberish,
  variance = "0.02",
  reason = ""
): void {
  const aBigNumber = ethers.BigNumber.from(a);
  const bBigNumber = ethers.BigNumber.from(b);
  const varianceBigNumber = ethers.utils.parseUnits(variance, 16);

  if (aBigNumber.eq(bBigNumber)) return;

  const diff = aBigNumber.sub(bBigNumber).abs().mul(ethers.constants.WeiPerEther).div(aBigNumber.add(bBigNumber));
  console.log("varianceBigNumber", varianceBigNumber.toString());
  console.log("diff", diff.toString());
  300000000000000;
  9559612654976426;
  assert.ok(diff.lte(varianceBigNumber), `${reason}: diff exceeded ${variance}`);
}
