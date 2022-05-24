// SPDX-License-Identifier: MIT

pragma solidity >=0.8.4 <0.9.0;

import { BaseTest, MockErc20Like, DebtTokenLike, SimpleVaultConfigLike, VaultLike, PancakeswapV2MCV2Worker02Like } from "../../base/BaseTest.sol";

contract PancakeswapV2MCV2Worker02_Test is BaseTest {
  MockErc20Like private btoken;
  SimpleVaultConfigLike private simpleVaultConfig;
  VaultLike private vault;
  PancakeswapV2MCV2Worker02Like private worker;

  function setUp() external {
    btoken = _setupToken("Some Base token", "BTOKEN", 18);
    simpleVaultConfig = _setupSimpleVaultConfig(0, 0, 1000, 100, address(1), address(2), address(3), 400, address(4));
    DebtTokenLike _debtToken = _setupDebtToken("DEBT_TOKEN_ibBTOKEN", "debt_ibBTOKEN", 18, address(0));

    vault = _setupVault(
      address(simpleVaultConfig),
      address(btoken),
      "Interest Bearing Base Token",
      "ibBTOKEN",
      18,
      address(_debtToken)
    );

    // worker = _setPancakeswapV2MCV2Worker02(
    //   _operator,
    //   _baseToken,
    //   _masterChefV2,
    //   _router,
    //   _pid,
    //   _addStrat,
    //   _liqStrat,
    //   _reinvestBountyBps,
    //   _treasuryAccount,
    //   _reinvestPath,
    //   _reinvestThreshold
    // );
  }

  function testCorrectness_init() external {
    assertEq(btoken.name(), "Some Base token");
    assertEq(btoken.symbol(), "BTOKEN");
  }

  function testWorkAddBaseTokenOnly() external {}
}
