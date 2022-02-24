pragma solidity 0.8.11;

interface IFeeDistributor {
  function depositFee(address _token, uint256 _amount) external returns (bool);
}
