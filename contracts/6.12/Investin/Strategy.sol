// SPDX-License-Identifier: MIT
pragma solidity 0.6.12;
pragma experimental ABIEncoderV2;


import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

import "@openzeppelin/contracts/access/Ownable.sol";

import "./IVN_ERC20.sol";



interface iIVNyToken {
    function investinVault() external view returns (address);
}

interface iALPACAibBUSD is IERC20{
    function deposit(uint _amount) external;
    function withdraw(uint _shares) external;
    function totalToken() external view returns(uint amount);
}

interface iStrategy{
    function getStrategyTokenPrice() external view returns (uint);
    function exit(uint256 amount) external;
    function enter(uint256 amount, bool isFund) external;
}

interface iRouter {
    struct FundInfo{
        bool isActive;
        uint128 amountInRouter;
    }
    function getFundMapping (address _fund) external view returns(FundInfo memory);
}



contract InvestinStrategyToken is ReentrancyGuard, iStrategy, Ownable, IVN_ERC20("ABC","ABC"){
    
    uint constant MAX_UINT_VALUE = type(uint).max;
    
    iALPACAibBUSD ibBUSD;
    IERC20 public  baseToken;
    uint256 public entryFee = 1e5; //0.1%
    
    address[] public fundFactories;
    
    iIVNyToken IVNy;
    
    bool public isActive = true;
    bool public status = true;
    
    constructor(address _ibBUSD, address _baseToken, address _IVNy) public {
        ibBUSD = iALPACAibBUSD(_ibBUSD);
        baseToken = IERC20(_baseToken);
        baseToken.approve(address(ibBUSD), MAX_UINT_VALUE);
        IVNy = iIVNyToken(_IVNy);
    }


    function addFactory(address[] calldata _fundFactories) external onlyOwner{
        for(uint i = 0; i<_fundFactories.length; i++){
            fundFactories.push(_fundFactories[i]);
        }
    }
    
    function updateEntryFee(uint val) external onlyOwner{
        require(val<=1e6, "NV");//1% max
        entryFee = val;
    }
    
    
    function updateActivityStatus(bool _value) external onlyOwner{
        isActive = _value;
    }

    function enter(uint256 amount, bool isFund) external override{
        enter(amount, isFund, 0);
    }
    
    function enter(uint256 amount, bool isFund, uint256 amountOutMin) public nonReentrant{
        require(isActive && status, "SiA");
        baseToken.transferFrom(msg.sender, address(this), amount);
        
        if(isFund==true){
            isFund = false;
            address[] memory _fundFactories = fundFactories;
            for(uint i=0;i<_fundFactories.length;i++){
                if(iRouter(_fundFactories[i]).getFundMapping(msg.sender).isActive){
                    isFund = true;
                    break;
                }
            }
        }
        if(isFund==false){
            uint _entryFee = (amount.mul(entryFee)) / 1e8;
            _entryFee == 0 || baseToken.transfer(IVNy.investinVault(), _entryFee);
            amount -= _entryFee;
        }

        enterHelper(amount, amountOutMin);
        
        
    }
    
    function enterHelper(uint amount, uint amountOutMin) internal{
        ibBUSD.deposit(amount);
        
        uint ibBUSDAmount = ibBUSD.balanceOf(address(this));
        
        require(ibBUSDAmount >= amountOutMin, "DFL");
        
        _mint(msg.sender, ibBUSDAmount);
        
    }
    function exitHelper(uint256 val) internal{
        baseToken.transfer(msg.sender, val);
    }
    
    function exit(uint256 amount) external override{
        exit(amount, 0);
    }
    
    function exit(uint256 amount, uint256 amountOutMin) public nonReentrant{
        uint mv;
        if(status = true){
            ibBUSD.withdraw(amount); 
            mv = baseToken.balanceOf(address(this));
            require(mv >= amountOutMin, "WFL");
        }
        else{
            mv = baseToken.balanceOf(address(this)).mul(amount).div(totalSupply());
        }
        _burn(msg.sender, amount);
        exitHelper(mv);
    }
    
    function invokeEmergencyWithdraw(uint256 amountOutMin) external onlyOwner {
        ibBUSD.withdraw(totalSupply());
        require(baseToken.balanceOf(address(this)) >= amountOutMin, "WFL");
        status = false;
    }
    
    
    function getStrategyTokenPrice() public view override returns (uint) {
        if(status!=true)
            return (baseToken.balanceOf(address(this)).mul(1e18)).div(totalSupply());
        else
            return (ibBUSD.totalToken()).mul(1e18).div(ibBUSD.totalSupply());
    }
    
    function kill() external onlyOwner{
        require(totalSupply() == 0, "NY");
        selfdestruct(msg.sender);
    }
    
}
