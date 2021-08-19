// SPDX-License-Identifier: MIT
pragma solidity >=0.6.0;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/Counters.sol";

//IVNy: ERC721 NFT to mark Investments unique based on Investors and Funds being mapped one-one

contract IVNyToken is ERC721, AccessControl{
    using Counters for Counters.Counter;
    
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");
  
    bool status = true;
    address public investinAddress;
    address public investinVault;
    Counters.Counter private TokenID;
    mapping (uint256 => address) public Token;
    
    constructor(address _investinVault) ERC721("Investin NFT", "IVNy") public {
        investinAddress = msg.sender;
        investinVault = _investinVault;
    }
    
    //To update Investin Vault address to collect protocol fees
    function updateInvestinVaultAddress(address _newInvestinVaultAddress) external{
        require(msg.sender==investinAddress, "Only Investin can call");
        investinVault = _newInvestinVaultAddress;
    }
    
    //To freeze/unfreeze IVNy minting and tranasfers
    function updateStatus(bool _status) external {
        require(msg.sender == investinAddress, "Only Investin can call");
        status = _status;
    }
    
    //To update IVNy metadata for resuing the same token for new investments 
    function updateToken(uint256 _tokenId, address _fundAddress) external {
        require(hasRole(MINTER_ROLE, msg.sender) || msg.sender == Token[_tokenId], "Only Router/Fund can call");
        Token[_tokenId] = _fundAddress;
    }
    
    //To update Investin Admin address
    function updateInvestinAddress(address newInvestin) external {
        require(msg.sender == investinAddress, "Only Invsetin can update");
        investinAddress = newInvestin;
    }
    
    //To mint new IVNy Tokens when an investment is initiated
    function mint(address fundAddress, address investorAddress) external returns (uint256) {
        require(status == true, "Status not active");
        require(hasRole(MINTER_ROLE, msg.sender), "Caller is not a minter");
    
        TokenID.increment();
        uint256 _tokenId = TokenID.current();
        
        Token[_tokenId] = fundAddress;
        _mint(investorAddress, _tokenId);
        return _tokenId;
    }
    
    //Getter Function: Investor and Fund Details
    function getTokenInfo(uint256 _tokenId) external view returns(address, address) {
        return (Token[_tokenId], ownerOf(_tokenId));
    }
    
    //To set MINTER_ROLE to Routers
    function roleAssignment(address routerAddress) external {
        require(msg.sender == investinAddress, "Only Investin can set Minter_role");
        _setupRole(MINTER_ROLE, routerAddress);
    }
    
    //Overide: To freeze/unfreeze IVNy transfers  
    function transferFrom(address from, address to, uint256 tokenId) public virtual override {
        safeTransferFrom(from, to, tokenId, "");
    }
    
    //Overide: to freeze/unfreeze IVNy transfers
    function safeTransferFrom(address from, address to, uint256 tokenId, bytes memory _data) public virtual override {
        require(status == true, "Status not active");
        require(_isApprovedOrOwner(_msgSender(), tokenId), "ERC721: transfer caller is not owner nor approved");
        _safeTransfer(from, to, tokenId, _data);
    }
}