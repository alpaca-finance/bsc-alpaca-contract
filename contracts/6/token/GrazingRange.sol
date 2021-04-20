pragma solidity 0.6.6;

import "@openzeppelin/contracts-ethereum-package/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts-ethereum-package/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts-ethereum-package/contracts/token/ERC20/SafeERC20.sol";
import "@openzeppelin/contracts-ethereum-package/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts-ethereum-package/contracts/access/Ownable.sol";
import "hardhat/console.sol";
import "@openzeppelin/contracts-ethereum-package/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts-ethereum-package/contracts/Initializable.sol";

/**
    ∩~~~~∩ 
    ξ ･×･ ξ 
    ξ　~　ξ 
    ξ　　 ξ 
    ξ　　 “~～~～〇 
    ξ　　　　　　 ξ 
    ξ ξ ξ~～~ξ ξ ξ 
　  ξ_ξξ_ξ　ξ_ξξ_ξ
 */

// Grazing Range allows users to stake ibALPACA to receive various rewards
contract GrazingRange is OwnableUpgradeSafe, ReentrancyGuardUpgradeSafe  {
    using SafeMath for uint256;
    using SafeERC20 for IERC20;

    // Info of each user.
    struct UserInfo {
        uint256 amount;     // How many Staking tokens the user has provided.
        uint256 rewardDebt; // Reward debt. See explanation below.
    }

    // Info of each reward distribution campaign.
    struct CampaignInfo {
        IERC20 stakingToken;      // Address of Staking token contract.
        IERC20 rewardToken; // Address of Reward token contract
        uint256 startBlock; // start block of the campaign
        uint256 lastRewardBlock;  // Last block number that Reward Token distribution occurs.
        uint256 accRewardPerShare; // Accumulated Reward Token per share, times 1e12. See below.
        uint256 totalStaked; // total staked amount each campaign's stake token, typically, each campaign has the same stake token, so need to track it separatedly
    }

    // Reward info
    struct RewardInfo {
        uint256 endBlock;
        uint256 rewardPerBlock;
    }

    // @dev this is mostly use for extending reward period
    // @notice Reward info is a set of {bonusEndBlock, rewardPerBlock}
    // mapped from campaigh ID
    mapping(uint256 => RewardInfo[]) public campaignRewardInfo;

    // @notice Info of each campaign. mapped from campaigh ID
    CampaignInfo[] public campaignInfo;
    // Info of each user that stakes Staking tokens.
    mapping(uint256 => mapping(address => UserInfo)) public userInfo;

    // @notice The block number when Reward Token mining starts. mapped from campaigh ID
    mapping(uint256 => uint256) public startBlock;

    // @notice limit length of reward info
    uint256 public rewardInfoLimit;

    event Deposit(address indexed user, uint256 amount);
    event Withdraw(address indexed user, uint256 amount);
    event EmergencyWithdraw(address indexed user, uint256 amount);

    function initialize() public initializer {
        OwnableUpgradeSafe.__Ownable_init();
        ReentrancyGuardUpgradeSafe.__ReentrancyGuard_init();
        rewardInfoLimit = 10;
    }

    // @notice set new reward info limit
    function setRewardInfoLimit(uint256 _updatedRewardInfoLimit) external onlyOwner {
        rewardInfoLimit = _updatedRewardInfoLimit;
    }

    // @notice reward campaign, one campaign represents a pair of staking and reward token, last reward Block and acc reward Per Share
    function addCampaignInfo(IERC20 _stakingToken, IERC20 _rewardToken, uint256 _startBlock) external onlyOwner {
        console.log('addCampaignInfo: init');
        campaignInfo.push(CampaignInfo({
            stakingToken: _stakingToken, 
            rewardToken: _rewardToken,
            startBlock: _startBlock,
            lastRewardBlock: _startBlock,
            accRewardPerShare: 0,
            totalStaked: 0
        }));
        console.log('addCampaignInfo: end');
    }

    // @notice if the new reward info is added, the reward & its end block will be extended by the newly pushed reward info.
    function addRewardInfo(uint256 _campaignID, uint256 _extendedEndBlock, uint256 _newRewardPerBlock) external onlyOwner {
        console.log('addRewardInfo: init');
        RewardInfo[] storage rewardInfo = campaignRewardInfo[_campaignID];
        require(rewardInfo.length < rewardInfoLimit, "addRewardInfo: reward info length exceeds the limit");
        rewardInfo.push(RewardInfo({
            endBlock: _extendedEndBlock,
            rewardPerBlock: _newRewardPerBlock
        }));
        console.log('addRewardInfo: campaign', rewardInfo[0].endBlock, rewardInfo[0].rewardPerBlock);
        console.log('addRewardInfo: end');
    }

    // @notice this will return  end block based on the current block number.
    function currentEndBlock(uint256 _campaignID) external view returns (uint256) {
        return _endBlockOf(_campaignID, block.number);
    }

    function _endBlockOf(uint256 _campaignID, uint256 _blockNumber) internal view returns (uint256) {
        RewardInfo[] storage rewardInfo = campaignRewardInfo[_campaignID];
        uint256 len = rewardInfo.length;
        for (uint256 i = 0; i < len; ++i) {
            RewardInfo memory info = rewardInfo[i];
            if (_blockNumber <= info.endBlock) return info.endBlock;
        }
        // @dev when couldn't find any reward info, it means that timestamp exceed endblock
        // so return the latest reward info.
        return rewardInfo[len-1].endBlock;
    }

    // @notice this will return reward per block based on the current block number.
    function currentRewardPerBlock(uint256 _campaignID) external view returns (uint256) {
        return _rewardPerBlockOf(_campaignID, block.number);
    }

    function _rewardPerBlockOf(uint256 _campaignID, uint256 _blockNumber) internal view returns (uint256) {
        RewardInfo[] storage rewardInfo = campaignRewardInfo[_campaignID];
        uint256 len = rewardInfo.length;
        for (uint256 i = 0; i < len; ++i) {
            RewardInfo memory info = rewardInfo[i];
            if (_blockNumber <= info.rewardPerBlock) return info.rewardPerBlock;
        }
        // @dev when couldn't find any reward info, it means that timestamp exceed endblock
        // so return the latest reward info
        return rewardInfo[len-1].rewardPerBlock;
    }


    // @notice Return reward multiplier over the given _from to _to block.
    function getMultiplier(uint256 _from, uint256 _to, uint256 _endBlock) public pure returns (uint256) {
        if (_to <= _endBlock) {
            return _to.sub(_from);
        } else if (_from >= _endBlock) {
            return 0;
        } else {
            return _endBlock.sub(_from);
        }
    }

    // @notice View function to see pending Reward on frontend.
    function pendingReward(uint256 _campaignID, address _user) external view returns (uint256) {
        CampaignInfo storage campaign = campaignInfo[_campaignID];
        UserInfo storage user = userInfo[_campaignID][_user];
        RewardInfo[] storage rewardInfo = campaignRewardInfo[_campaignID];
        uint256 accRewardPerShare = campaign.accRewardPerShare;
        uint256 totalSupply = campaign.totalStaked;
        if (block.number > campaign.lastRewardBlock && totalSupply != 0) {
            uint256 rewardInfoLen = rewardInfo.length;
            uint256 multiplier;
            uint256 rewardPerBlock;
            for (uint256 i = 0; i < rewardInfoLen; ++i) {
                RewardInfo memory info = rewardInfo[i];
                rewardPerBlock = info.rewardPerBlock;
                multiplier = getMultiplier(campaign.lastRewardBlock, block.number, info.endBlock);
                if (multiplier == 0) continue;
                uint256 reward = multiplier.mul(rewardPerBlock);
                accRewardPerShare = accRewardPerShare.add(reward.mul(1e12).div(totalSupply));
            }
        }
        return user.amount.mul(accRewardPerShare).div(1e12).sub(user.rewardDebt);
    }

    // @notice Update reward variables of the given campaign to be up-to-date.
    function updateCampaign(uint256 _campaignID) public {
        CampaignInfo storage campaign = campaignInfo[_campaignID];
        RewardInfo[] storage rewardInfo = campaignRewardInfo[_campaignID];
        console.log("updateCampaign: block validation", block.number, campaign.lastRewardBlock);
        if (block.number <= campaign.lastRewardBlock) {
            return;
        }
        uint256 totalSupply = campaign.totalStaked;
        console.log("updateCampaign: total supply", totalSupply);
        if (totalSupply == 0) {
            campaign.lastRewardBlock = block.number;
            return;
        }
        uint256 rewardInfoLen = rewardInfo.length;
        uint256 multiplier;
        uint256 rewardPerBlock;
        console.log("updateCampaign: rewardInfo length", rewardInfo.length);
        // @dev for each reward info
        for (uint256 i = 0; i < rewardInfoLen; ++i) {
            RewardInfo memory info = rewardInfo[i];
            rewardPerBlock = info.rewardPerBlock;
            console.log("updateCampaign: loop rewardInfo reward per block", info.rewardPerBlock);
            // @dev get multiplier based on current Block and rewardInfo's end block
            // multiplier will be a range of either (current block - campaign.lastRewardBlock)
            // or (reward info's endblock - campaign.lastRewardBlock) or 0
            multiplier = getMultiplier(campaign.lastRewardBlock, block.number, info.endBlock);
            console.log("updateCampaign: multiplier", multiplier);
            if (multiplier == 0) continue;
            // @dev if currentBlock exceed end block, use end block as the last reward block
            // so that for the next iteration, previous endBlock will be used as the last reward block
            if (block.number > info.endBlock) {
                campaign.lastRewardBlock = info.endBlock;
            } else {
                campaign.lastRewardBlock = block.number;
            }
            uint256 reward = multiplier.mul(rewardPerBlock);
            console.log("updateCampaign: reward finalized", reward);
            campaign.accRewardPerShare = campaign.accRewardPerShare.add(reward.mul(1e12).div(totalSupply));
            console.log("updateCampaign: reward.mul(1e12), total supply", reward.mul(1e12), totalSupply);
        }
    }

    // @notice Update reward variables for all campaigns. gas spending is HIGH in this method call, BE CAREFUL
    function massUpdateCampaigns() external {
        uint256 length = campaignInfo.length;
        for (uint256 pid = 0; pid < length; ++pid) {
            updateCampaign(pid);
        }
    }

    // @notice Stake Staking tokens to GrazingRange
    function deposit(uint256 _campaignID, uint256 _amount) external nonReentrant {
        console.log("Deposit: start deposit");
        CampaignInfo storage campaign = campaignInfo[_campaignID];
        console.log("Deposit: after campaign info", campaign.accRewardPerShare);
        UserInfo storage user = userInfo[_campaignID][msg.sender];
        console.log("Deposit: after user info", campaign.accRewardPerShare);
        updateCampaign(_campaignID);
        console.log("Deposit: after update campaign", campaign.accRewardPerShare);
        if (user.amount > 0) {
            uint256 pending = user.amount.mul(campaign.accRewardPerShare).div(1e12).sub(user.rewardDebt);
            if(pending > 0) {
                campaign.rewardToken.safeTransfer(address(msg.sender), pending);
            }
        }
        if (_amount > 0) {
            campaign.stakingToken.safeTransferFrom(address(msg.sender), address(this), _amount);
            user.amount = user.amount.add(_amount);
            campaign.totalStaked = campaign.totalStaked.add(_amount);
        }
        user.rewardDebt = user.amount.mul(campaign.accRewardPerShare).div(1e12);
        console.log("Deposit: end deposit");
        emit Deposit(msg.sender, _amount);
    }

    // @notice Withdraw Staking tokens from STAKING.
    function withdraw(uint256 _campaignID, uint256 _amount) external nonReentrant {
        _withdraw(_campaignID, _amount);
        emit Withdraw(msg.sender, _amount);
    }

    // @notice internal method for withdraw (withdraw and harvest method depend on this method)
    function _withdraw(uint256 _campaignID, uint256 _amount) internal {
        CampaignInfo storage campaign = campaignInfo[_campaignID];
        UserInfo storage user = userInfo[_campaignID][msg.sender];
        require(user.amount >= _amount, "withdraw: withdraw amount exceed available amount");
        updateCampaign(_campaignID);
        uint256 pending = user.amount.mul(campaign.accRewardPerShare).div(1e12).sub(user.rewardDebt);
        if (pending > 0) {
            campaign.rewardToken.safeTransfer(address(msg.sender), pending);
        }
        if (_amount > 0) {
            user.amount = user.amount.sub(_amount);
            campaign.stakingToken.safeTransfer(address(msg.sender), _amount);
            campaign.totalStaked = campaign.totalStaked.sub(_amount);
        }
        user.rewardDebt = user.amount.mul(campaign.accRewardPerShare).div(1e12);

        emit Withdraw(msg.sender, _amount);
    }

    // @notice method for harvest campaigns (used when the user want to claim their reward token based on specified campaigns)
    function harvest(uint256[] calldata _campaignIDs) external nonReentrant {
        for (uint256 i = 0; i < _campaignIDs.length; ++i) {
            _withdraw(_campaignIDs[i], 0);
        }
    }

    // @notice Withdraw without caring about rewards. EMERGENCY ONLY.
    function emergencyWithdraw(uint256 _campaignID) external {
        CampaignInfo storage campaign = campaignInfo[_campaignID];
        UserInfo storage user = userInfo[_campaignID][msg.sender];
        campaign.stakingToken.safeTransfer(address(msg.sender), user.amount);
        user.amount = 0;
        user.rewardDebt = 0;
        emit EmergencyWithdraw(msg.sender, user.amount);
    }

    // @notice Withdraw reward. EMERGENCY ONLY.
    function emergencyRewardWithdraw(uint256 _campaignID, uint256 _amount) external onlyOwner {
        CampaignInfo storage campaign = campaignInfo[_campaignID];
        require(_amount < campaign.rewardToken.balanceOf(address(this)), "emergencyRewardWithdraw: not enough token");
        campaign.rewardToken.safeTransfer(address(msg.sender), _amount);
    }
}