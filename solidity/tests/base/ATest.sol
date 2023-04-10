// SPDX-License-Identifier: MIT
pragma solidity >=0.5.0;

import { StdAssertions } from "@forge-std/StdAssertions.sol";

// solhint-disable
contract ATest is StdAssertions {
  function assertCloseWei(uint256 actual, uint256 expected, uint256 variance) internal {
    if (actual < expected - variance || actual > expected + variance) {
      emit log("Error: a not close to b");
      emit log_named_uint("  Expected", expected);
      emit log_named_uint("    Actual", actual);
      emit log_named_uint("  Variance", variance);
      fail();
    }
  }

  function assertCloseBps(uint256 actual, uint256 expected, uint256 varianceBps) internal {
    if (actual == expected) return;

    uint256 diff = actual > expected ? actual - expected : expected - actual;
    if (diff * 1e4 > expected * varianceBps) {
      emit log("Error: a not close to b");
      emit log_named_uint("      Expected", expected);
      emit log_named_uint("        Actual", actual);
      emit log_named_uint("  Variance BPS", varianceBps);
      fail();
    }
  }
}
