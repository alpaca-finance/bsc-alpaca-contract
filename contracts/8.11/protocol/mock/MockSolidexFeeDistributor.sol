pragma solidity 0.8.11;

import "../apis/solidex/IFeeDistributor.sol";
import "../../utils/SafeToken.sol";

contract MockSolidexFeeDistributor is IFeeDistributor {
  using SafeToken for address;

  function depositFee(address _token, uint256 _amount) external returns (bool) {
    _token.safeTransferFrom(msg.sender, address(this), _amount);
    return true;
  }
}
