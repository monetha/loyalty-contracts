pragma solidity ^0.4.24;

import "openzeppelin-solidity/contracts/lifecycle/Pausable.sol";
import "openzeppelin-solidity/contracts/token/ERC20/ERC20Basic.sol";
import "openzeppelin-solidity/contracts/token/ERC20/ERC20.sol";
import "openzeppelin-solidity/contracts/token/ERC20/SafeERC20.sol";
import "monetha-utility-contracts/contracts/Restricted.sol";
import "./ownership/CanReclaimEther.sol";
import "./ownership/CanReclaimTokens.sol";

contract MonethaClaimHandler is Restricted, Pausable, CanReclaimEther, CanReclaimTokens {
    using SafeERC20 for ERC20;
    using SafeERC20 for ERC20Basic;

    event MinStakeUpdated(uint256 previousMinStake, uint256 newMinStake);

    event ClaimCreated(uint256 indexed dealId, uint256 indexed claimIdx);
    event ClaimAccepted(uint256 indexed dealId, uint256 indexed claimIdx);
    event ClaimResolved(uint256 indexed dealId, uint256 indexed claimIdx);
    event ClaimClosedAfterAcceptanceExpired(uint256 indexed dealId, uint256 indexed claimIdx);
    event ClaimClosedAfterResolutionExpired(uint256 indexed dealId, uint256 indexed claimIdx);
    event ClaimClosedAfterConfirmationExpired(uint256 indexed dealId, uint256 indexed claimIdx);
    event ClaimClosed(uint256 indexed dealId, uint256 indexed claimIdx);

    ERC20 public mthToken;
    uint256 public minStake;

    enum State {
        Null,
        AwaitingAcceptance,
        AwaitingResolution,
        AwaitingConfirmation,
        ClosedAfterAcceptanceExpired,
        ClosedAfterResolutionExpired,
        ClosedAfterConfirmationExpired,
        Closed
    }

    struct Claim {
        State state;
        uint256 timestamp;
        uint256 dealId; // immutable after AwaitingAcceptance
        string reasonNote; // immutable after AwaitingAcceptance
        string requesterId; // immutable after AwaitingAcceptance
        address requesterAddress; // immutable after AwaitingAcceptance
        uint256 requesterStaked; // immutable after AwaitingAcceptance
        string respondentId; // immutable after AwaitingAcceptance
        address respondentAddress; // immutable after Accepted
        uint256 respondentStaked; // immutable after Accepted
        string resolutionNote; // immutable after Resolved
    }

    Claim[] public claims;

    constructor(ERC20 _mthToken, uint256 _minStake) public {
        require(_mthToken != address(0), "must be valid token address");

        mthToken = _mthToken;
        _setMinStake(_minStake);
    }

    function getClaimsCount() public constant returns (uint256 count) {
        return claims.length;
    }

    function create(
        uint256 _dealId,
        string _reasonNote,
        string _requesterId,
        string _respondentId
    ) external whenNotPaused {
        require(bytes(_reasonNote).length > 0, "reason note must not be empty");
        require(bytes(_requesterId).length > 0, "requester ID must not be empty");
        require(bytes(_respondentId).length > 0, "respondent ID must not be empty");
        require(keccak256(abi.encodePacked(_requesterId)) != keccak256(abi.encodePacked(_respondentId)),
            "requester and respondent must be different");

        uint256 requesterStaked = _stakeMTHFrom(msg.sender);

        Claim memory claim = Claim({
            state : State.AwaitingAcceptance,
            timestamp : now,
            dealId : _dealId,
            reasonNote : _reasonNote,
            requesterId : _requesterId,
            requesterAddress : msg.sender,
            requesterStaked : requesterStaked,
            respondentId : _respondentId,
            respondentAddress : address(0),
            respondentStaked : 0,
            resolutionNote : ""
            });
        claims.push(claim);

        emit ClaimCreated(_dealId, claims.length - 1);
    }

    function accept(uint256 _claimIdx) external whenNotPaused {
        require(_claimIdx < claims.length, "invalid claim index");
        Claim storage claim = claims[_claimIdx];
        require(State.AwaitingAcceptance == claim.state, "State.AwaitingAcceptance required");
        require(msg.sender != claim.requesterAddress, "requester and respondent addresses must be different");

        uint256 respondentStaked = _stakeMTHFrom(msg.sender);

        claim.state = State.AwaitingResolution;
        claim.timestamp = now;
        claim.respondentAddress = msg.sender;
        claim.respondentStaked = respondentStaked;

        emit ClaimAccepted(claim.dealId, _claimIdx);
    }

    function resolve(uint256 _claimIdx, string _resolutionNote) external whenNotPaused {
        require(_claimIdx < claims.length, "invalid claim index");
        Claim storage claim = claims[_claimIdx];
        require(State.AwaitingResolution == claim.state, "State.AwaitingResolution required");
        require(msg.sender == claim.respondentAddress, "awaiting respondent");

        claim.state = State.AwaitingConfirmation;
        claim.timestamp = now;
        claim.resolutionNote = _resolutionNote;

        emit ClaimResolved(claim.dealId, _claimIdx);
    }

    function close(uint256 _claimIdx) external whenNotPaused {
        require(_claimIdx < claims.length, "invalid claim index");
        State state = claims[_claimIdx].state;

        if (State.AwaitingAcceptance == state) {
            _closeAfterAwaitingAcceptance(_claimIdx);
        } else if (State.AwaitingResolution == state) {
            _closeAfterAwaitingResolution(_claimIdx);
        } else if (State.AwaitingConfirmation == state) {
            _closeAfterAwaitingConfirmation(_claimIdx);
        }

        revert("claim.State");
    }

    function _closeAfterAwaitingAcceptance(uint256 _claimIdx) internal {
        Claim storage claim = claims[_claimIdx];
        require(msg.sender == claim.requesterAddress, "awaiting requester");
        require(State.AwaitingAcceptance == claim.state, "State.AwaitingAcceptance required");
        require(_hoursPassed(claim.timestamp, 72), "expiration required");

        uint256 stakedBefore = claim.requesterStaked;

        claim.state = State.ClosedAfterAcceptanceExpired;
        claim.timestamp = now;
        claim.requesterStaked = 0;
        if (stakedBefore > 0) {
            mthToken.safeTransfer(msg.sender, stakedBefore);
        }

        emit ClaimClosedAfterAcceptanceExpired(claim.dealId, _claimIdx);
    }

    function _closeAfterAwaitingResolution(uint256 _claimIdx) internal {
        Claim storage claim = claims[_claimIdx];
        require(State.AwaitingResolution == claim.state, "State.AwaitingResolution required");
        require(_hoursPassed(claim.timestamp, 72), "expiration required");
        require(msg.sender == claim.requesterAddress || msg.sender == claim.respondentAddress, "awaiting requester or respondent");

        uint256 reqStakedBefore = claim.requesterStaked;
        uint256 respStakedBefore = claim.respondentStaked;

        claim.state = State.ClosedAfterResolutionExpired;
        claim.timestamp = now;
        claim.requesterStaked = 0;
        claim.respondentStaked = 0;

        if (reqStakedBefore > 0) {
            mthToken.safeTransfer(msg.sender, reqStakedBefore);
        }
        if (respStakedBefore > 0) {
            mthToken.safeTransfer(msg.sender, respStakedBefore);
        }

        emit ClaimClosedAfterResolutionExpired(claim.dealId, _claimIdx);
    }

    function _closeAfterAwaitingConfirmation(uint256 _claimIdx) internal {
        Claim storage claim = claims[_claimIdx];
        require(msg.sender == claim.requesterAddress, "awaiting requester");
        require(State.AwaitingConfirmation == claim.state, "State.AwaitingConfirmation required");

        bool expired = _hoursPassed(claim.timestamp, 24);
        if (expired) {
            claim.state = State.ClosedAfterConfirmationExpired;
        } else {
            claim.state = State.Closed;
        }
        claim.timestamp = now;

        uint256 stakedBefore = claim.requesterStaked;
        claim.requesterStaked = 0;
        if (stakedBefore > 0) {
            mthToken.safeTransfer(msg.sender, stakedBefore);
        }

        if (expired) {
            emit ClaimClosedAfterConfirmationExpired(claim.dealId, _claimIdx);
        } else {
            emit ClaimClosed(claim.dealId, _claimIdx);
        }
    }

    function setMinStake(uint256 _newMinStake) external whenNotPaused onlyMonetha {
        _setMinStake(_newMinStake);
    }

    function _hoursPassed(uint256 start, uint256 hoursAfter) internal view returns (bool) {
        return now >= start + hoursAfter * 1 hours;
    }

    function _stakeMTHFrom(address _from) internal returns (uint256 staked) {
        staked = mthToken.allowance(_from, address(this));
        require(staked >= minStake, "min. stake allowance needed");

        mthToken.safeTransferFrom(_from, address(this), staked);
    }

    function _setMinStake(uint256 _newMinStake) internal {
        uint256 previousMinStake = minStake;
        if (previousMinStake != _newMinStake) {
            emit MinStakeUpdated(previousMinStake, _newMinStake);
            minStake = _newMinStake;
        }
    }
}