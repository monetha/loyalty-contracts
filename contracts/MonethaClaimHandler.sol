pragma solidity ^0.4.24;

import "openzeppelin-solidity/contracts/lifecycle/Pausable.sol";
import "openzeppelin-solidity/contracts/token/ERC20/ERC20Basic.sol";
import "openzeppelin-solidity/contracts/token/ERC20/ERC20.sol";
import "openzeppelin-solidity/contracts/token/ERC20/SafeERC20.sol";
import "monetha-utility-contracts/contracts/Restricted.sol";
import "./ownership/CanReclaimEther.sol";
import "./ownership/CanReclaimTokens.sol";

/**
 *  @title MonethaClaimHandler
 *
 *  MonethaClaimHandler handles claim creation, acceptance, resolution and confirmation.
 */
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

    ERC20 public token;      // token contract address
    uint256 public minStake; // minimum amount of token units to create and accept claim

    // State of claim
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
        uint256 modified;
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

    constructor(ERC20 _token, uint256 _minStake) public {
        require(_token != address(0), "must be valid token address");

        token = _token;
        _setMinStake(_minStake);
    }

    /**
     * @dev sets the minimum amount of tokens units to stake when creating or accepting the claim.
     * Only Monetha account allowed to call this method.
     */
    function setMinStake(uint256 _newMinStake) external whenNotPaused onlyMonetha {
        _setMinStake(_newMinStake);
    }

    /**
     * @dev returns the number of claims created.
     */
    function getClaimsCount() public constant returns (uint256 count) {
        return claims.length;
    }

    /**
    * @dev creates new claim using provided parameters. Before calling this method, requester should approve
    * this contract to transfer min. amount of token units in their behalf, by calling
    * `approve(address _spender, uint _value)` method of token contract.
    * Respondent should accept the claim by calling accept() method.
    * claimIdx should be extracted from ClaimCreated event.
    */
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

        uint256 requesterStaked = _stakeTokensFrom(msg.sender);

        Claim memory claim = Claim({
            state : State.AwaitingAcceptance,
            modified : now,
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

    /**
     * @dev accepts the claim by respondent. Before calling this method, respondent should approve
     * this contract to transfer min. amount of token units in their behalf, by calling
     * `approve(address _spender, uint _value)` method of token contract.
     */
    function accept(uint256 _claimIdx) external whenNotPaused {
        require(_claimIdx < claims.length, "invalid claim index");
        Claim storage claim = claims[_claimIdx];
        require(State.AwaitingAcceptance == claim.state, "State.AwaitingAcceptance required");
        require(msg.sender != claim.requesterAddress, "requester and respondent addresses must be different");

        uint256 respondentStaked = _stakeTokensFrom(msg.sender);

        claim.state = State.AwaitingResolution;
        claim.modified = now;
        claim.respondentAddress = msg.sender;
        claim.respondentStaked = respondentStaked;

        emit ClaimAccepted(claim.dealId, _claimIdx);
    }

    /**
     * @dev resolves the claim by respondent. Respondent will get staked amount of tokens back.
     */
    function resolve(uint256 _claimIdx, string _resolutionNote) external whenNotPaused {
        require(_claimIdx < claims.length, "invalid claim index");
        Claim storage claim = claims[_claimIdx];
        require(State.AwaitingResolution == claim.state, "State.AwaitingResolution required");
        require(msg.sender == claim.respondentAddress, "awaiting respondent");

        uint256 respStakedBefore = claim.respondentStaked;

        claim.state = State.AwaitingConfirmation;
        claim.modified = now;
        claim.respondentStaked = 0;
        claim.resolutionNote = _resolutionNote;

        if (respStakedBefore > 0) {
            token.safeTransfer(msg.sender, respStakedBefore);
        }

        emit ClaimResolved(claim.dealId, _claimIdx);
    }

    /**
     * @dev closes the claim by requester.
     * Requester allowed to call this method 72 hours after call to create() or accept(), and immediately after resolve().
     * Requester will get staked amount of tokens back. Requester will also get the respondent’s tokens if
     * the respondent did not call the resolve() method within 72 hours.
     */
    function close(uint256 _claimIdx) external whenNotPaused {
        require(_claimIdx < claims.length, "invalid claim index");
        State state = claims[_claimIdx].state;

        if (State.AwaitingAcceptance == state) {
            return _closeAfterAwaitingAcceptance(_claimIdx);
        } else if (State.AwaitingResolution == state) {
            return _closeAfterAwaitingResolution(_claimIdx);
        } else if (State.AwaitingConfirmation == state) {
            return _closeAfterAwaitingConfirmation(_claimIdx);
        }

        revert("claim.State");
    }

    function _closeAfterAwaitingAcceptance(uint256 _claimIdx) internal {
        Claim storage claim = claims[_claimIdx];
        require(msg.sender == claim.requesterAddress, "awaiting requester");
        require(State.AwaitingAcceptance == claim.state, "State.AwaitingAcceptance required");
        require(_hoursPassed(claim.modified, 72), "expiration required");

        uint256 stakedBefore = claim.requesterStaked;

        claim.state = State.ClosedAfterAcceptanceExpired;
        claim.modified = now;
        claim.requesterStaked = 0;
        if (stakedBefore > 0) {
            token.safeTransfer(msg.sender, stakedBefore);
        }

        emit ClaimClosedAfterAcceptanceExpired(claim.dealId, _claimIdx);
    }

    function _closeAfterAwaitingResolution(uint256 _claimIdx) internal {
        Claim storage claim = claims[_claimIdx];
        require(State.AwaitingResolution == claim.state, "State.AwaitingResolution required");
        require(_hoursPassed(claim.modified, 72), "expiration required");
        require(msg.sender == claim.requesterAddress, "awaiting requester");

        uint256 reqStakedBefore = claim.requesterStaked;
        uint256 respStakedBefore = claim.respondentStaked;

        claim.state = State.ClosedAfterResolutionExpired;
        claim.modified = now;
        claim.requesterStaked = 0;
        claim.respondentStaked = 0;

        if (reqStakedBefore > 0) {
            token.safeTransfer(msg.sender, reqStakedBefore);
        }
        if (respStakedBefore > 0) {
            token.safeTransfer(msg.sender, respStakedBefore);
        }

        emit ClaimClosedAfterResolutionExpired(claim.dealId, _claimIdx);
    }

    function _closeAfterAwaitingConfirmation(uint256 _claimIdx) internal {
        Claim storage claim = claims[_claimIdx];
        require(msg.sender == claim.requesterAddress, "awaiting requester");
        require(State.AwaitingConfirmation == claim.state, "State.AwaitingConfirmation required");

        bool expired = _hoursPassed(claim.modified, 24);
        if (expired) {
            claim.state = State.ClosedAfterConfirmationExpired;
        } else {
            claim.state = State.Closed;
        }
        claim.modified = now;

        uint256 stakedBefore = claim.requesterStaked;
        claim.requesterStaked = 0;
        if (stakedBefore > 0) {
            token.safeTransfer(msg.sender, stakedBefore);
        }

        if (expired) {
            emit ClaimClosedAfterConfirmationExpired(claim.dealId, _claimIdx);
        } else {
            emit ClaimClosed(claim.dealId, _claimIdx);
        }
    }

    function _hoursPassed(uint256 start, uint256 hoursAfter) internal view returns (bool) {
        return now >= start + hoursAfter * 1 hours;
    }

    function _stakeTokensFrom(address _from) internal returns (uint256 staked) {
        staked = token.allowance(_from, address(this));
        require(staked >= minStake, "min. stake allowance needed");

        token.safeTransferFrom(_from, address(this), staked);
    }

    function _setMinStake(uint256 _newMinStake) internal {
        uint256 previousMinStake = minStake;
        if (previousMinStake != _newMinStake) {
            emit MinStakeUpdated(previousMinStake, _newMinStake);
            minStake = _newMinStake;
        }
    }
}