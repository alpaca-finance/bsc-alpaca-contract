import chai from "chai";
import { solidity } from "ethereum-waffle";
import { BigNumber } from "ethers";

chai.use(solidity);
const { expect } = chai;

export function assertAlmostEqual(expected: string, actual: string) {
  const expectedBN = BigNumber.from(expected);
  const actualBN = BigNumber.from(actual);
  const diffBN = expectedBN.gt(actualBN) ? expectedBN.sub(actualBN) : actualBN.sub(expectedBN);
  const tolerance = expectedBN.div(BigNumber.from('10000'))
  return expect(diffBN, `${actual} is not almost eqaual to ${expected}`).to.be.lte(tolerance);
}