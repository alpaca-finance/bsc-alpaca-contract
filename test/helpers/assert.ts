import chai from "chai";
import { solidity } from "ethereum-waffle";
import { BigNumber, BigNumberish, ethers } from "ethers";

chai.use(solidity);
const { expect, assert } = chai;

export function assertAlmostEqual(expected: string, actual: string) {
  const expectedBN = BigNumber.from(expected);
  const actualBN = BigNumber.from(actual);
  const diffBN = expectedBN.gt(actualBN) ? expectedBN.sub(actualBN) : actualBN.sub(expectedBN);
  const tolerance = expectedBN.div(BigNumber.from("10000"));
  return expect(diffBN, `actual: ${actual} is not almost eqaual to expected: ${expected}`).to.be.lte(tolerance);
}

export function assertBigNumberClose(
  actual: BigNumberish,
  expected: BigNumberish,
  variance: BigNumberish = 10,
  reason: string = ""
) {
  const actualBigNumber = BigNumber.from(actual);
  const expectedBigNumber = BigNumber.from(expected);

  assert.ok(
    actualBigNumber.gte(expectedBigNumber.sub(variance)),
    `${reason}: actual is too small to be close with expected with variance ${variance}`
  );

  assert.ok(
    actualBigNumber.lte(expectedBigNumber.add(variance)),
    `${reason}: actual is too big to be close with expected with variance ${variance}`
  );
}

export function assertBigNumberClosePercent(
  a: BigNumberish,
  b: BigNumberish,
  variance: string = "0.02",
  reason: string = ""
) {
  const aBigNumber = BigNumber.from(a);
  const bBigNumber = BigNumber.from(b);
  const varianceBigNumber = ethers.utils.parseUnits(variance, 16);

  if (aBigNumber.eq(bBigNumber)) return;

  const diff = aBigNumber.sub(bBigNumber).abs().mul(ethers.constants.WeiPerEther).div(aBigNumber.add(bBigNumber));
  assert.ok(
    diff.lte(varianceBigNumber),
    `${reason}: diff exceeded ${variance}: ${aBigNumber.toString()} ${bBigNumber.toString()}`
  );
}
