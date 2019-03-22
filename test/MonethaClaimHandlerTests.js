import {advanceBlock} from "./helpers/advanceToBlock";
import Revert from "./helpers/VMExceptionRevert";

import {duration, increaseTimeTo} from "./helpers/increaseTime";

const {shouldBehaveLikeCanReclaimEther} = require('./CanReclaimEther.behavior');
const {shouldBehaveLikeCanReclaimTokens} = require('./CanReclaimTokens.behavior');

const {BigNumber} = require('./helpers/setup');
const expectEvent = require('./helpers/expectEvent');

const MonethaClaimHandler = artifacts.require("MonethaClaimHandler");
const Token = artifacts.require("ERC20Mintable");

contract('MonethaClaimHandler', function (accounts) {

    const OWNER = accounts[0];
    const MONETHA_ACCOUNT = accounts[1];
    const REQUESTER = accounts[2];
    const RESPONDENT = accounts[3];
    const OTHER = accounts[4];

    const MIN_STAKE = 15000000; // 150 MTH

    const StateNull = 0;
    const StateAwaitingAcceptance = 1;
    const StateAwaitingResolution = 2;
    const StateAwaitingConfirmation = 3;
    const StateClosedAfterAcceptanceExpired = 4;
    const StateClosedAfterResolutionExpired = 5;
    const StateClosedAfterConfirmationExpired = 6;
    const StateClosed = 7;

    let token;
    let claimHandler;

    before(async () => {
        token = await Token.new({from: OWNER});

        await token.mint(REQUESTER, 100 * MIN_STAKE, {from: OWNER});
        await token.mint(RESPONDENT, 100 * MIN_STAKE, {from: OWNER});

        claimHandler = await MonethaClaimHandler.new(token.address, MIN_STAKE, {from: OWNER});

        await claimHandler.setMonethaAddress(MONETHA_ACCOUNT, true, {from: OWNER});

        advanceBlock();
    });

    beforeEach(async function () {
        this.mock = claimHandler;
        this.token = token;
    });

    it('should be able to create new claim', async () => {
        // arrange
        const dealID = 1234;
        const reasonNote = "reason note";
        const requesterId = "requester id";
        const respondentId = "respondent id";

        await token.approve(claimHandler.address, MIN_STAKE, {from: REQUESTER});

        const requesterBalance = new BigNumber(await token.balanceOf(REQUESTER));
        const claimHandlerBalance = new BigNumber(await token.balanceOf(claimHandler.address));
        const count = new BigNumber(await claimHandler.getClaimsCount());

        // act
        const tx = await claimHandler.create(dealID, reasonNote, requesterId, respondentId, {from: REQUESTER});
        const txTimestamp = web3.eth.getBlock(tx.receipt.blockNumber).timestamp;

        // assert
        // claims count
        const count2 = new BigNumber(await claimHandler.getClaimsCount());
        count2.should.be.bignumber.equal(count.add(1));

        // event emitted
        expectEvent.inLogs(tx.logs, "ClaimCreated", {
            dealId: dealID,
            claimIdx: count,
        });

        // MTH staked
        const requesterBalance2 = new BigNumber(await token.balanceOf(REQUESTER));
        requesterBalance2.should.be.bignumber.equal(requesterBalance.sub(MIN_STAKE));
        const claimHandlerBalance2 = new BigNumber(await token.balanceOf(claimHandler.address));
        claimHandlerBalance2.should.be.bignumber.equal(claimHandlerBalance.add(MIN_STAKE));

        // claim state
        const [
            claimState,
            claimTimestamp,
            claimDealId,
            claimReasonNote,
            claimRequesterId,
            claimRequesterAddress,
            claimRequesterStaked,
            claimRespondentId,
            claimRespondentAddress,
            claimRespondentStaked,
            claimResolutionNote,
        ] = await claimHandler.claims(count);

        claimState.should.be.bignumber.equal(StateAwaitingAcceptance);
        claimTimestamp.should.be.bignumber.equal(txTimestamp);
        claimDealId.should.be.bignumber.equal(dealID);
        assert.equal(claimReasonNote, reasonNote);
        assert.equal(claimRequesterId, requesterId);
        assert.equal(claimRequesterAddress, REQUESTER);
        claimRequesterStaked.should.be.bignumber.equal(MIN_STAKE);
        assert.equal(claimRespondentId, respondentId);
        assert.equal(claimRespondentAddress, 0x0);
        claimRespondentStaked.should.be.bignumber.equal(0);
        assert.equal(claimResolutionNote, "");
    });

    shouldBehaveLikeCanReclaimEther(OTHER);
    shouldBehaveLikeCanReclaimTokens(OTHER);
});
