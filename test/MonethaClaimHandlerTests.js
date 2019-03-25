import {advanceBlock} from "./helpers/advanceToBlock";
import Revert from "./helpers/VMExceptionRevert";

import increaseTime, {duration} from "./helpers/increaseTime";

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

    const stateField = 0;
    const timestampField = 1;
    const dealIdField = 2;
    const reasonNoteField = 3;
    const requesterIdField = 4;
    const requesterAddressField = 5;
    const requesterStakedField = 6;
    const respondentIdField = 7;
    const respondentAddressField = 8;
    const respondentStakedField = 9;
    const resolutionNoteField = 10;

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

    it('should allow requester to create new claim', async () => {
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
        const claim = await claimHandler.claims(count);

        claim[stateField].should.be.bignumber.equal(StateAwaitingAcceptance);
        claim[timestampField].should.be.bignumber.equal(txTimestamp);
        claim[dealIdField].should.be.bignumber.equal(dealID);
        assert.equal(claim[reasonNoteField], reasonNote);
        assert.equal(claim[requesterIdField], requesterId);
        assert.equal(claim[requesterAddressField], REQUESTER);
        claim[requesterStakedField].should.be.bignumber.equal(MIN_STAKE);
        assert.equal(claim[respondentIdField], respondentId);
        assert.equal(claim[respondentAddressField], 0x0);
        claim[respondentStakedField].should.be.bignumber.equal(0);
        assert.equal(claim[resolutionNoteField], "");
    });

    it('should not allow requester to close the claim within 72 hours after creation', async () => {
        // arrange
        const dealID = 1234;
        const reasonNote = "reason note";
        const requesterId = "requester id";
        const respondentId = "respondent id";

        await token.approve(claimHandler.address, MIN_STAKE, {from: REQUESTER});

        const claimId = new BigNumber(await claimHandler.getClaimsCount());
        await claimHandler.create(dealID, reasonNote, requesterId, respondentId, {from: REQUESTER});

        // act
        await claimHandler.close(claimId, {from: REQUESTER}).should.be.rejectedWith(Revert);

        await increaseTime(duration.hours(71) + duration.minutes(59));

        await claimHandler.close(claimId, {from: REQUESTER}).should.be.rejectedWith(Revert);

        // assert
    });

    it('should allow requester to close the claim 72 hours after creation', async () => {
        // arrange
        const dealID = 1234;
        const reasonNote = "reason note";
        const requesterId = "requester id";
        const respondentId = "respondent id";

        await token.approve(claimHandler.address, MIN_STAKE, {from: REQUESTER});

        const claimId = new BigNumber(await claimHandler.getClaimsCount());
        await claimHandler.create(dealID, reasonNote, requesterId, respondentId, {from: REQUESTER});

        await increaseTime(duration.hours(72));

        const requesterBalance = new BigNumber(await token.balanceOf(REQUESTER));
        const claimHandlerBalance = new BigNumber(await token.balanceOf(claimHandler.address));

        // act
        const tx = await claimHandler.close(claimId, {from: REQUESTER});
        const txTimestamp = web3.eth.getBlock(tx.receipt.blockNumber).timestamp;

        // assert

        // event emitted
        expectEvent.inLogs(tx.logs, "ClaimClosedAfterAcceptanceExpired", {
            dealId: dealID,
            claimIdx: claimId,
        });

        // MTH staked
        const requesterBalance2 = new BigNumber(await token.balanceOf(REQUESTER));
        requesterBalance2.should.be.bignumber.equal(requesterBalance.add(MIN_STAKE));
        const claimHandlerBalance2 = new BigNumber(await token.balanceOf(claimHandler.address));
        claimHandlerBalance2.should.be.bignumber.equal(claimHandlerBalance.sub(MIN_STAKE));

        // claim state
        const claim = await claimHandler.claims(claimId);

        claim[stateField].should.be.bignumber.equal(StateClosedAfterAcceptanceExpired);
        claim[timestampField].should.be.bignumber.equal(txTimestamp);
        claim[dealIdField].should.be.bignumber.equal(dealID);
        assert.equal(claim[reasonNoteField], reasonNote);
        assert.equal(claim[requesterIdField], requesterId);
        assert.equal(claim[requesterAddressField], REQUESTER);
        claim[requesterStakedField].should.be.bignumber.equal(0);
        assert.equal(claim[respondentIdField], respondentId);
        assert.equal(claim[respondentAddressField], 0x0);
        claim[respondentStakedField].should.be.bignumber.equal(0);
        assert.equal(claim[resolutionNoteField], "");
    });

    shouldBehaveLikeCanReclaimEther(OTHER);
    shouldBehaveLikeCanReclaimTokens(OTHER);
});
