// SPDX-License-Identifier: MIT
pragma solidity >=0.8.4 <0.9.0;

import { BaseTest, MockErc20Like, DebtTokenLike, SimpleVaultConfigLike, VaultLike, MockNFTLike, NFTStakingLike } from "./base/BaseTest.sol";

contract NFTBoostedLeverageControllerTest is BaseTest {
    MockErc20Like private cakeToken;
    MockErc20Like private WBNB;
    
    NFTStakingLike private nftStaking;

    // Mock NFT
    MockNFTLike private mockNFT;
    // PoolID
    bytes32 private poolId1;
    bytes32 private poolId2;
    bytes32 private poolId3;

    function setUp() external {
        nftStaking = _setupNFTStaking();
        cakeToken = _setupToken("CakeToken", "CAKE", 18);
        WBNB = _setupToken("Wrapped BNB", "WBNB", 18);
        poolId1 = "NFT1";
        poolId2 = "NFT2";
        poolId3 = "NFT3";
    }

    function testSetBoostedLeverage() external {
    }

    function testFailSetBoostedLeverage() external {

    }

    function testGetBoostedWorkFactor() external {

    }

    function testGetBoostedKillFactor() external {
        
    }
}
