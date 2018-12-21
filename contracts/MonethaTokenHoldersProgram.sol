pragma solidity ^0.4.24;

import "openzeppelin-solidity/contracts/math/SafeMath.sol";
import "openzeppelin-solidity/contracts/lifecycle/Pausable.sol";
import "openzeppelin-solidity/contracts/token/ERC20/ERC20Basic.sol";
import "openzeppelin-solidity/contracts/token/ERC20/ERC20.sol";
import "openzeppelin-solidity/contracts/token/ERC20/SafeERC20.sol";
import "./IMonethaVoucher.sol";
import "monetha-utility-contracts/Restricted.sol";
import "monetha-utility-contracts/DateTime.sol";
import "./ownership/CanReclaimEther.sol";
import "./ownership/CanReclaimTokens.sol";


contract MonethaTokenHoldersProgram is Restricted, Pausable, CanReclaimEther, CanReclaimTokens {
    using SafeMath for uint256;
    using SafeERC20 for ERC20;
    using SafeERC20 for ERC20Basic;

    event VouchersPurchased(uint256 vouchers, uint256 weis);
    event VouchersSold(uint256 vouchers, uint256 weis);
    event ParticipationStarted(address indexed participant, uint256 mthTokens);
    event ParticipationStopped(address indexed participant, uint256 mthTokens);
    event VouchersRedeemed(address indexed participant, uint256 vouchers);

    ERC20 public mthToken;
    IMonethaVoucher public monethaVoucher;

    uint256 public participateFromTimestamp;

    mapping(address => uint256) public stakedBy;
    uint256 public totalStacked;

    constructor(ERC20 _mthToken, IMonethaVoucher _monethaVoucher) public {
        require(_monethaVoucher != address(0), "must be valid address");
        require(_mthToken != address(0), "must be valid address");

        mthToken = _mthToken;
        monethaVoucher = _monethaVoucher;
        // don't allow to participate
        participateFromTimestamp = uint256(- 1);
    }

    /**
     * @dev Before holders of MTH tokens can participate in the program, it is necessary to buy vouchers for the Ether
     * available in the contract. 1/3 of Monetha's revenue will be transferred to this contract to buy the Monetha vouchers.
     * This method uses all available Ethers of contract to buy Monetha vouchers.
     * The method tries to buy the maximum possible amount of vouchers.
     */
    function buyVouchers() external onlyMonetha {
        uint256 amountToExchange = address(this).balance;
        require(amountToExchange > 0, "positive balance needed");

        uint256 vouchersAvailable = monethaVoucher.totalInSharedPool();
        require(vouchersAvailable > 0, "no vouchers available");

        uint256 vouchersToBuy = monethaVoucher.fromWei(address(this).balance);
        // limit vouchers
        if (vouchersToBuy > vouchersAvailable) {
            vouchersToBuy = vouchersAvailable;
        }
        // we should transfer exact amount of Ether which is equal to vouchers
        amountToExchange = monethaVoucher.toWei(vouchersToBuy);

        (uint256 year, uint256 month,) = DateTime.toDate(now);
        participateFromTimestamp = _nextMonth1stDayTimestamp(year, month);

        monethaVoucher.buyVouchers.value(amountToExchange)(vouchersToBuy);

        emit VouchersPurchased(vouchersToBuy, amountToExchange);
    }

    /**
     * @dev Converts all available vouchers to Ether and stops the program until vouchers are purchased again by
     * calling `buyVouchers` method.
     * Holders of MTH token holders can still call `cancelParticipation` method to reclaim the MTH tokens.
     */
    function sellVouchers() external onlyMonetha {
        // don't allow to participate
        participateFromTimestamp = uint256(- 1);

        uint256 vouchersPool = monethaVoucher.purchasedBy(address(this));
        uint256 weis = monethaVoucher.sellVouchers(vouchersPool);

        emit VouchersSold(vouchersPool, weis);
    }

    /**
     * @dev Returns true when it's allowed to participate in token holders program, i.e. to call `participate()` method.
     */
    function isAllowedToParticipateNow() external view returns (bool) {
        return now >= participateFromTimestamp && _participateIsAllowed(now);
    }

    /**
     * @dev To redeem vouchers, holders of MTH token must declare their participation on the 1st day of the month by calling
     * this method. Before calling this method, holders of MTH token should approve this contract to transfer some amount
     * of MTH tokens in their behalf, by calling `approve(address _spender, uint _value)` method of MTH token contract.
     * `participate` method can be called on the first day of any month if the contract has purchased vouchers.
     */
    function participate() external {
        require(now >= participateFromTimestamp, "too early to participate");
        require(_participateIsAllowed(now), "participate on the 1st day of every month");

        uint256 allowedToTransfer = mthToken.allowance(msg.sender, address(this));
        require(allowedToTransfer > 0, "positive allowance needed");

        mthToken.safeTransferFrom(msg.sender, address(this), allowedToTransfer);
        stakedBy[msg.sender] = stakedBy[msg.sender].add(allowedToTransfer);
        totalStacked = totalStacked.add(allowedToTransfer);

        emit ParticipationStarted(msg.sender, allowedToTransfer);
    }

    /**
     * @dev Returns true when it's allowed to redeem vouchers and reclaim MTH tokens, i.e. to call `redeem()` method.
     */
    function isAllowedToRedeemNow() external view returns (bool) {
        return now >= participateFromTimestamp && _redeemIsAllowed(now);
    }

    /**
     * @dev Redeems vouchers to holder of MTH tokens and reclaims the MTH tokens.
     * The method can be invoked only if the holder of the MTH tokens declared participation on the first day of the month.
     * The method should be called half an hour after the beginning of the second day of the month and half an hour
     * before the beginning of the next month.
     */
    function redeem() external {
        require(now >= participateFromTimestamp, "too early to redeem");
        require(_redeemIsAllowed(now), "redeem is not allowed at the moment");

        (uint256 stackedBefore, uint256 totalStackedBefore) = _cancelParticipation();

        uint256 vouchersPool = monethaVoucher.purchasedBy(address(this));
        uint256 vouchers = vouchersPool.mul(stackedBefore).div(totalStackedBefore);

        require(monethaVoucher.releasePurchasedTo(msg.sender, vouchers), "vouchers was not released");

        emit VouchersRedeemed(msg.sender, vouchers);
    }

    /**
     * @dev Cancels participation of holder of MTH tokens at any time and reclaims MTH tokens.
     */
    function cancelParticipation() external {
        _cancelParticipation();
    }

    // Allows direct funds send by Monetha
    function() external onlyMonetha payable {
    }

    function _cancelParticipation() internal returns (uint256 stackedBefore, uint256 totalStackedBefore) {
        stackedBefore = stakedBy[msg.sender];
        require(stackedBefore > 0, "must be a participant");
        totalStackedBefore = totalStacked;

        stakedBy[msg.sender] = 0;
        totalStacked = totalStackedBefore.sub(stackedBefore);
        mthToken.safeTransfer(msg.sender, stackedBefore);

        emit ParticipationStopped(msg.sender, stackedBefore);
    }

    function _participateIsAllowed(uint256 _now) internal pure returns (bool) {
        (,, uint256 day) = DateTime.toDate(_now);
        return day == 1;
    }

    function _redeemIsAllowed(uint256 _now) internal pure returns (bool) {
        (uint256 year, uint256 month,) = DateTime.toDate(_now);
        return _currentMonth2ndDayTimestamp(year, month) + 30 minutes <= _now &&
        _now <= _nextMonth1stDayTimestamp(year, month) - 30 minutes;
    }

    function _currentMonth2ndDayTimestamp(uint256 _year, uint256 _month) internal pure returns (uint256) {
        return DateTime.toTimestamp(_year, _month, 2);
    }

    function _nextMonth1stDayTimestamp(uint256 _year, uint256 _month) internal pure returns (uint256) {
        _month += 1;
        if (_month > 12) {
            _year += 1;
            _month = 1;
        }
        return DateTime.toTimestamp(_year, _month, 1);
    }
}
