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

    const FieldState = 0;
    const FieldModified = 1;
    const FieldDealId = 2;
    const FieldReasonNote = 3;
    const FieldRequesterId = 4;
    const FieldRequesterAddress = 5;
    const FieldRequesterStaked = 6;
    const FieldRespondentId = 7;
    const FieldRespondentAddress = 8;
    const FieldRespondentStaked = 9;
    const FieldResolutionNote = 10;

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

        advanceBlock();
    });

    describe('create', function () {
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
            console.log("\tcreate, gas used:", tx.receipt.gasUsed);

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

            claim[FieldState].should.be.bignumber.equal(StateAwaitingAcceptance);
            claim[FieldModified].should.be.bignumber.equal(txTimestamp);
            claim[FieldDealId].should.be.bignumber.equal(dealID);
            assert.equal(claim[FieldReasonNote], reasonNote);
            assert.equal(claim[FieldRequesterId], requesterId);
            assert.equal(claim[FieldRequesterAddress], REQUESTER);
            claim[FieldRequesterStaked].should.be.bignumber.equal(MIN_STAKE);
            assert.equal(claim[FieldRespondentId], respondentId);
            assert.equal(claim[FieldRespondentAddress], 0x0);
            claim[FieldRespondentStaked].should.be.bignumber.equal(0);
            assert.equal(claim[FieldResolutionNote], "");
        });
    });


    describe('close', function () {
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

        it('should allow only requester to close the claim 72 hours after creation', async () => {
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
            await claimHandler.close(claimId, {from: RESPONDENT}).should.be.rejectedWith(Revert);
            await claimHandler.close(claimId, {from: OTHER}).should.be.rejectedWith(Revert);
            await claimHandler.close(claimId, {from: OWNER}).should.be.rejectedWith(Revert);
            await claimHandler.close(claimId, {from: MONETHA_ACCOUNT}).should.be.rejectedWith(Revert);

            const tx = await claimHandler.close(claimId, {from: REQUESTER});
            const txTimestamp = web3.eth.getBlock(tx.receipt.blockNumber).timestamp;
            console.log("\tclose, gas used:", tx.receipt.gasUsed);

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

            claim[FieldState].should.be.bignumber.equal(StateClosedAfterAcceptanceExpired);
            claim[FieldModified].should.be.bignumber.equal(txTimestamp);
            claim[FieldDealId].should.be.bignumber.equal(dealID);
            assert.equal(claim[FieldReasonNote], reasonNote);
            assert.equal(claim[FieldRequesterId], requesterId);
            assert.equal(claim[FieldRequesterAddress], REQUESTER);
            claim[FieldRequesterStaked].should.be.bignumber.equal(0);
            assert.equal(claim[FieldRespondentId], respondentId);
            assert.equal(claim[FieldRespondentAddress], 0x0);
            claim[FieldRespondentStaked].should.be.bignumber.equal(0);
            assert.equal(claim[FieldResolutionNote], "");
        });

        it('should not allow requester to close the claim within 72 hours after acceptance', async () => {
            // arrange
            const dealID = 1234;
            const reasonNote = "reason note";
            const requesterId = "requester id";
            const respondentId = "respondent id";

            await token.approve(claimHandler.address, MIN_STAKE, {from: REQUESTER});

            const claimId = new BigNumber(await claimHandler.getClaimsCount());
            await claimHandler.create(dealID, reasonNote, requesterId, respondentId, {from: REQUESTER});

            await token.approve(claimHandler.address, MIN_STAKE, {from: RESPONDENT});
            await claimHandler.accept(claimId, {from: RESPONDENT});

            // act
            await claimHandler.close(claimId, {from: REQUESTER}).should.be.rejectedWith(Revert);

            await increaseTime(duration.hours(71) + duration.minutes(59));

            await claimHandler.close(claimId, {from: REQUESTER}).should.be.rejectedWith(Revert);

            // assert
        });

        it('should allow only requester to close the claim 72 hours after acceptance', async () => {
            // arrange
            const dealID = 1234;
            const reasonNote = "reason note";
            const requesterId = "requester id";
            const respondentId = "respondent id";

            await token.approve(claimHandler.address, MIN_STAKE, {from: REQUESTER});

            const claimId = new BigNumber(await claimHandler.getClaimsCount());
            await claimHandler.create(dealID, reasonNote, requesterId, respondentId, {from: REQUESTER});

            await token.approve(claimHandler.address, MIN_STAKE, {from: RESPONDENT});
            await claimHandler.accept(claimId, {from: RESPONDENT});

            await increaseTime(duration.hours(72));

            const requesterBalance = new BigNumber(await token.balanceOf(REQUESTER));
            const respondentBalance = new BigNumber(await token.balanceOf(RESPONDENT));
            const claimHandlerBalance = new BigNumber(await token.balanceOf(claimHandler.address));

            // act
            await claimHandler.close(claimId, {from: RESPONDENT}).should.be.rejectedWith(Revert);
            await claimHandler.close(claimId, {from: OTHER}).should.be.rejectedWith(Revert);
            await claimHandler.close(claimId, {from: OWNER}).should.be.rejectedWith(Revert);
            await claimHandler.close(claimId, {from: MONETHA_ACCOUNT}).should.be.rejectedWith(Revert);

            const tx = await claimHandler.close(claimId, {from: REQUESTER});
            const txTimestamp = web3.eth.getBlock(tx.receipt.blockNumber).timestamp;
            console.log("\tclose, gas used:", tx.receipt.gasUsed);

            // assert

            // event emitted
            expectEvent.inLogs(tx.logs, "ClaimClosedAfterResolutionExpired", {
                dealId: dealID,
                claimIdx: claimId,
            });

            // MTH staked
            const requesterBalance2 = new BigNumber(await token.balanceOf(REQUESTER));
            requesterBalance2.should.be.bignumber.equal(requesterBalance.add(2 * MIN_STAKE));
            const respondentBalance2 = new BigNumber(await token.balanceOf(RESPONDENT));
            respondentBalance2.should.be.bignumber.equal(respondentBalance);
            const claimHandlerBalance2 = new BigNumber(await token.balanceOf(claimHandler.address));
            claimHandlerBalance2.should.be.bignumber.equal(claimHandlerBalance.sub(2 * MIN_STAKE));

            // claim state
            const claim = await claimHandler.claims(claimId);

            claim[FieldState].should.be.bignumber.equal(StateClosedAfterResolutionExpired);
            claim[FieldModified].should.be.bignumber.equal(txTimestamp);
            claim[FieldDealId].should.be.bignumber.equal(dealID);
            assert.equal(claim[FieldReasonNote], reasonNote);
            assert.equal(claim[FieldRequesterId], requesterId);
            assert.equal(claim[FieldRequesterAddress], REQUESTER);
            claim[FieldRequesterStaked].should.be.bignumber.equal(0);
            assert.equal(claim[FieldRespondentId], respondentId);
            assert.equal(claim[FieldRespondentAddress], RESPONDENT);
            claim[FieldRespondentStaked].should.be.bignumber.equal(0);
            assert.equal(claim[FieldResolutionNote], "");
        });

        it('should allow only requester to close claim within 24 hours after resolution with Closed state', async () => {
            // arrange
            const dealID = 1234;
            const reasonNote = "reason note";
            const requesterId = "requester id";
            const respondentId = "respondent id";
            const resolutionNote = "resolution note";

            await token.approve(claimHandler.address, MIN_STAKE, {from: REQUESTER});

            const claimId = new BigNumber(await claimHandler.getClaimsCount());
            await claimHandler.create(dealID, reasonNote, requesterId, respondentId, {from: REQUESTER});

            await token.approve(claimHandler.address, MIN_STAKE, {from: RESPONDENT});
            await claimHandler.accept(claimId, {from: RESPONDENT});

            await claimHandler.resolve(claimId, resolutionNote, {from: RESPONDENT});

            await increaseTime(duration.hours(23) + duration.minutes(59));

            const requesterBalance = new BigNumber(await token.balanceOf(REQUESTER));
            const claimHandlerBalance = new BigNumber(await token.balanceOf(claimHandler.address));

            // act
            await claimHandler.close(claimId, {from: RESPONDENT}).should.be.rejectedWith(Revert);
            await claimHandler.close(claimId, {from: OTHER}).should.be.rejectedWith(Revert);
            await claimHandler.close(claimId, {from: OWNER}).should.be.rejectedWith(Revert);
            await claimHandler.close(claimId, {from: MONETHA_ACCOUNT}).should.be.rejectedWith(Revert);

            const tx = await claimHandler.close(claimId, {from: REQUESTER});
            const txTimestamp = web3.eth.getBlock(tx.receipt.blockNumber).timestamp;
            console.log("\tclose, gas used:", tx.receipt.gasUsed);

            // assert

            // event emitted
            expectEvent.inLogs(tx.logs, "ClaimClosed", {
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

            claim[FieldState].should.be.bignumber.equal(StateClosed);
            claim[FieldModified].should.be.bignumber.equal(txTimestamp);
            claim[FieldDealId].should.be.bignumber.equal(dealID);
            assert.equal(claim[FieldReasonNote], reasonNote);
            assert.equal(claim[FieldRequesterId], requesterId);
            assert.equal(claim[FieldRequesterAddress], REQUESTER);
            claim[FieldRequesterStaked].should.be.bignumber.equal(0);
            assert.equal(claim[FieldRespondentId], respondentId);
            assert.equal(claim[FieldRespondentAddress], RESPONDENT);
            claim[FieldRespondentStaked].should.be.bignumber.equal(0);
            assert.equal(claim[FieldResolutionNote], resolutionNote);
        });

        it('should allow only requester to close claim 24 hours after resolution with ClosedAfterConfirmationExpired state', async () => {
            // arrange
            const dealID = 1234;
            const reasonNote = "reason note";
            const requesterId = "requester id";
            const respondentId = "respondent id";
            const resolutionNote = "resolution note";

            await token.approve(claimHandler.address, MIN_STAKE, {from: REQUESTER});

            const claimId = new BigNumber(await claimHandler.getClaimsCount());
            await claimHandler.create(dealID, reasonNote, requesterId, respondentId, {from: REQUESTER});

            await token.approve(claimHandler.address, MIN_STAKE, {from: RESPONDENT});
            await claimHandler.accept(claimId, {from: RESPONDENT});

            await claimHandler.resolve(claimId, resolutionNote, {from: RESPONDENT});

            await increaseTime(duration.hours(24));

            const requesterBalance = new BigNumber(await token.balanceOf(REQUESTER));
            const claimHandlerBalance = new BigNumber(await token.balanceOf(claimHandler.address));

            // act
            await claimHandler.close(claimId, {from: RESPONDENT}).should.be.rejectedWith(Revert);
            await claimHandler.close(claimId, {from: OTHER}).should.be.rejectedWith(Revert);
            await claimHandler.close(claimId, {from: OWNER}).should.be.rejectedWith(Revert);
            await claimHandler.close(claimId, {from: MONETHA_ACCOUNT}).should.be.rejectedWith(Revert);

            const tx = await claimHandler.close(claimId, {from: REQUESTER});
            const txTimestamp = web3.eth.getBlock(tx.receipt.blockNumber).timestamp;
            console.log("\tclose, gas used:", tx.receipt.gasUsed);

            // assert

            // event emitted
            expectEvent.inLogs(tx.logs, "ClaimClosedAfterConfirmationExpired", {
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

            claim[FieldState].should.be.bignumber.equal(StateClosedAfterConfirmationExpired);
            claim[FieldModified].should.be.bignumber.equal(txTimestamp);
            claim[FieldDealId].should.be.bignumber.equal(dealID);
            assert.equal(claim[FieldReasonNote], reasonNote);
            assert.equal(claim[FieldRequesterId], requesterId);
            assert.equal(claim[FieldRequesterAddress], REQUESTER);
            claim[FieldRequesterStaked].should.be.bignumber.equal(0);
            assert.equal(claim[FieldRespondentId], respondentId);
            assert.equal(claim[FieldRespondentAddress], RESPONDENT);
            claim[FieldRespondentStaked].should.be.bignumber.equal(0);
            assert.equal(claim[FieldResolutionNote], resolutionNote);
        });
    });


    describe('accept', function () {
        it('should allow respondent, but not the requester to accept the claim after creation by staking the same amount of tokens', async () => {
            // arrange
            const requesterStake = 2 * MIN_STAKE;
            const dealID = 1234;
            const reasonNote = "reason note";
            const requesterId = "requester id";
            const respondentId = "respondent id";

            await token.approve(claimHandler.address, requesterStake, {from: REQUESTER});

            const claimId = new BigNumber(await claimHandler.getClaimsCount());
            await claimHandler.create(dealID, reasonNote, requesterId, respondentId, {from: REQUESTER});
            await increaseTime(duration.hours(71) + duration.minutes(59));

            const respondentBalance = new BigNumber(await token.balanceOf(RESPONDENT));
            const claimHandlerBalance = new BigNumber(await token.balanceOf(claimHandler.address));

            // act
            await token.approve(claimHandler.address, requesterStake, {from: REQUESTER});
            await claimHandler.accept(claimId, {from: REQUESTER}).should.be.rejectedWith(Revert); // not respondent

            await token.approve(claimHandler.address, requesterStake - 1, {from: RESPONDENT});
            await claimHandler.accept(claimId, {from: RESPONDENT}).should.be.rejectedWith(Revert); // not equal to requester stake

            await token.approve(claimHandler.address, requesterStake + MIN_STAKE, {from: RESPONDENT}); // only amount of `requesterStake` should be staked
            const tx = await claimHandler.accept(claimId, {from: RESPONDENT});
            const txTimestamp = web3.eth.getBlock(tx.receipt.blockNumber).timestamp;
            console.log("\taccept, gas used:", tx.receipt.gasUsed);

            // assert

            // MTH staked
            const respondentBalance2 = new BigNumber(await token.balanceOf(RESPONDENT));
            respondentBalance2.should.be.bignumber.equal(respondentBalance.sub(requesterStake));
            const claimHandlerBalance2 = new BigNumber(await token.balanceOf(claimHandler.address));
            claimHandlerBalance2.should.be.bignumber.equal(claimHandlerBalance.add(requesterStake));

            // event
            expectEvent.inLogs(tx.logs, "ClaimAccepted", {
                dealId: dealID,
                claimIdx: claimId,
            });

            // claim state
            const claim = await claimHandler.claims(claimId);

            claim[FieldState].should.be.bignumber.equal(StateAwaitingResolution);
            claim[FieldModified].should.be.bignumber.equal(txTimestamp);
            claim[FieldDealId].should.be.bignumber.equal(dealID);
            assert.equal(claim[FieldReasonNote], reasonNote);
            assert.equal(claim[FieldRequesterId], requesterId);
            assert.equal(claim[FieldRequesterAddress], REQUESTER);
            claim[FieldRequesterStaked].should.be.bignumber.equal(requesterStake);
            assert.equal(claim[FieldRespondentId], respondentId);
            assert.equal(claim[FieldRespondentAddress], RESPONDENT);
            claim[FieldRespondentStaked].should.be.bignumber.equal(requesterStake);
            assert.equal(claim[FieldResolutionNote], "");
        });
    });


    describe('resolve', function () {
        it('should allow only respondent to resolve claim after acceptance', async () => {
            // arrange
            const dealID = 1234;
            const reasonNote = "reason note";
            const requesterId = "requester id";
            const respondentId = "respondent id";
            const resolutionNote = "resolution note";

            await token.approve(claimHandler.address, MIN_STAKE, {from: REQUESTER});

            const claimId = new BigNumber(await claimHandler.getClaimsCount());
            await claimHandler.create(dealID, reasonNote, requesterId, respondentId, {from: REQUESTER});

            await token.approve(claimHandler.address, MIN_STAKE, {from: RESPONDENT});
            await claimHandler.accept(claimId, {from: RESPONDENT});

            const requesterBalance = new BigNumber(await token.balanceOf(REQUESTER));
            const respondentBalance = new BigNumber(await token.balanceOf(RESPONDENT));
            const claimHandlerBalance = new BigNumber(await token.balanceOf(claimHandler.address));

            // act
            await claimHandler.resolve(claimId, resolutionNote, {from: REQUESTER}).should.be.rejectedWith(Revert);
            await claimHandler.resolve(claimId, resolutionNote, {from: OTHER}).should.be.rejectedWith(Revert);
            await claimHandler.resolve(claimId, resolutionNote, {from: OWNER}).should.be.rejectedWith(Revert);
            await claimHandler.resolve(claimId, resolutionNote, {from: MONETHA_ACCOUNT}).should.be.rejectedWith(Revert);

            const tx = await claimHandler.resolve(claimId, resolutionNote, {from: RESPONDENT});
            const txTimestamp = web3.eth.getBlock(tx.receipt.blockNumber).timestamp;
            console.log("\tresolve, gas used:", tx.receipt.gasUsed);

            // assert

            // event emitted
            expectEvent.inLogs(tx.logs, "ClaimResolved", {
                dealId: dealID,
                claimIdx: claimId,
            });

            // MTH staked
            const requesterBalance2 = new BigNumber(await token.balanceOf(REQUESTER));
            requesterBalance2.should.be.bignumber.equal(requesterBalance);
            const respondentBalance2 = new BigNumber(await token.balanceOf(RESPONDENT));
            respondentBalance2.should.be.bignumber.equal(respondentBalance.add(MIN_STAKE));
            const claimHandlerBalance2 = new BigNumber(await token.balanceOf(claimHandler.address));
            claimHandlerBalance2.should.be.bignumber.equal(claimHandlerBalance.sub(MIN_STAKE));

            // claim state
            const claim = await claimHandler.claims(claimId);

            claim[FieldState].should.be.bignumber.equal(StateAwaitingConfirmation);
            claim[FieldModified].should.be.bignumber.equal(txTimestamp);
            claim[FieldDealId].should.be.bignumber.equal(dealID);
            assert.equal(claim[FieldReasonNote], reasonNote);
            assert.equal(claim[FieldRequesterId], requesterId);
            assert.equal(claim[FieldRequesterAddress], REQUESTER);
            claim[FieldRequesterStaked].should.be.bignumber.equal(MIN_STAKE);
            assert.equal(claim[FieldRespondentId], respondentId);
            assert.equal(claim[FieldRespondentAddress], RESPONDENT);
            claim[FieldRespondentStaked].should.be.bignumber.equal(0);
            assert.equal(claim[FieldResolutionNote], resolutionNote);
        });
    });

    describe('setMinStake', function () {
        it('should allow only Monetha account to set minimum stake amount', async () => {
            // arrange
            const minStake = await claimHandler.minStake();
            const newMinStake = minStake.mul(2);

            // act
            await claimHandler.setMinStake(newMinStake, {from: REQUESTER}).should.be.rejectedWith(Revert);
            await claimHandler.setMinStake(newMinStake, {from: RESPONDENT}).should.be.rejectedWith(Revert);
            await claimHandler.setMinStake(newMinStake, {from: OTHER}).should.be.rejectedWith(Revert);

            const tx = await claimHandler.setMinStake(newMinStake, {from: MONETHA_ACCOUNT});
            console.log("\tsetMinStake, gas used:", tx.receipt.gasUsed);

            // assert

            // event emitted
            expectEvent.inLogs(tx.logs, "MinStakeUpdated", {
                previousMinStake: minStake,
                newMinStake: newMinStake,
            });

            // check value
            const minStake2 = await claimHandler.minStake();
            minStake2.should.be.bignumber.equal(newMinStake);

            // restore
            await claimHandler.setMinStake(minStake, {from: MONETHA_ACCOUNT});
        });
    });

    shouldBehaveLikeCanReclaimEther(OTHER);
    shouldBehaveLikeCanReclaimTokens(OTHER);
});
