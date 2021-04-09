pragma solidity 0.6.6;

import "@openzeppelin/contracts-ethereum-package/contracts/token/ERC20/IERC20.sol";

interface IMigratorFairLaunch {
    function migrate(IERC20 token) external returns (IERC20);
}