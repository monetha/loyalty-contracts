import {advanceBlock} from "./helpers/advanceToBlock";
import Revert from "./helpers/VMExceptionRevert";

import {duration, increaseTimeTo} from "./helpers/increaseTime";

const {shouldBehaveLikeCanReclaimEther} = require('../node_modules/monetha-utility-contracts/test/CanReclaimEther.behavior');
const {shouldBehaveLikeCanReclaimTokens} = require('../node_modules/monetha-utility-contracts/test/CanReclaimTokens.behavior');

const {BigNumber} = require('./helpers/setup');
const expectEvent = require('./helpers/expectEvent');

const MonethaTokenHoldersProgram = artifacts.require("MonethaTokenHoldersProgram");
const Token = artifacts.require("ERC20Mintable");
const MonethaVoucher = artifacts.require("MonethaVoucher");
const DateTimeMock = artifacts.require('DateTimeMock');

contract('MonethaTokenHoldersProgram', function (accounts) {

    const OWNER = accounts[0];
    const VOUCHER = accounts[1];
    const VOUCHER2 = accounts[2];
    const OTHER = accounts[4];

    const voucherMthRate = 1000000000000000000;
    const mthEthRate = 10000000000000;
    const tokenToMint = 100000000000000000000000;
    const value = new BigNumber('1e9');
    const vouchersBought = 20000;
    const vouchersWei = 2000000000;
    const tokensToStake = 10;

    let tokenHolder, token, vouchers;
    let dateTime;

    before(async () => {
        dateTime = await DateTimeMock.new();

        token = await Token.new();

        vouchers = await MonethaVoucher.new(
            voucherMthRate,
            mthEthRate,
            token.address
        );

        tokenHolder = await MonethaTokenHoldersProgram.new(
            token.address,
            vouchers.address
        );

        await tokenHolder.setMonethaAddress(VOUCHER, true);
        await tokenHolder.setMonethaAddress(VOUCHER2, true);
        await tokenHolder.setMonethaAddress(vouchers.address, true);
        await vouchers.setMonethaAddress(VOUCHER, true);
        await vouchers.setMonethaAddress(VOUCHER2, true);
        await vouchers.setMonethaAddress(tokenHolder.address, true);
        await tokenHolder.transferOwnership(OWNER);

        await token.mint(vouchers.address, tokenToMint);

        await tokenHolder.sendTransaction({from: VOUCHER, value: value});
        await tokenHolder.sendTransaction({from: VOUCHER2, value: value});

        await vouchers.sendTransaction({from: VOUCHER, value: value});
        await vouchers.sendTransaction({from: VOUCHER2, value: value});

        advanceBlock();
    });

    beforeEach(async function () {
        this.mock = tokenHolder;
        this.token = token;
    });

    it('should be able to buy vouchers successfully', async () => {
        const purchasedVouchersBefore = await vouchers.purchasedBy(tokenHolder.address);
        const balanceBefore = new BigNumber(web3.eth.getBalance(tokenHolder.address));

        const tx = await tokenHolder.buyVouchers({from: VOUCHER2});

        expectEvent.inLogs(tx.logs, "VouchersPurchased", {
            vouchers: vouchersBought,
            weis: vouchersWei,
        });

        const purchasedVouchersAfter = await vouchers.purchasedBy(tokenHolder.address);
        const balanceAfter = new BigNumber(web3.eth.getBalance(tokenHolder.address));

        purchasedVouchersAfter.sub(purchasedVouchersBefore).should.be.bignumber.equal(vouchersBought);
        balanceBefore.sub(balanceAfter).should.be.bignumber.equal(vouchersWei);
    });

    it("should not be able to buy vouchers from other accounts", async function () {
        await tokenHolder.buyVouchers({from: OTHER}).should.be.rejectedWith(Revert);
    });

    it('should be able to sell Vouchers successfully', async () => {
        const purchasedVouchersBefore = await vouchers.purchasedBy(tokenHolder.address);
        const balanceBefore = new BigNumber(web3.eth.getBalance(tokenHolder.address));

        const res = await tokenHolder.sellVouchers({from: VOUCHER2});

        expectEvent.inLogs(res.logs, "VouchersSold", {
            vouchers: vouchersBought,
            weis: vouchersWei,
        });

        const purchasedVouchersAfter = await vouchers.purchasedBy(tokenHolder.address);
        const balanceAfter = new BigNumber(web3.eth.getBalance(tokenHolder.address));

        purchasedVouchersBefore.sub(purchasedVouchersAfter).should.be.bignumber.equal(vouchersBought);
        balanceAfter.sub(balanceBefore).should.be.bignumber.equal(vouchersWei);
    });

    it("should not be able to sell vouchers from other accounts", async function () {
        await tokenHolder.sellVouchers({from: OTHER}).should.be.rejectedWith(Revert);
    });

    it('should be able to buy vouchers successfully', async () => {
        const tx = await tokenHolder.buyVouchers({from: VOUCHER2});

        expectEvent.inLogs(tx.logs, "VouchersPurchased", {
            vouchers: vouchersBought,
            weis: vouchersWei,
        });
    });

    it('should check if users are allowed to participate in program', async () => {
        let participateFromTimestamp = await tokenHolder.participateFromTimestamp();

        await increaseTimeTo(participateFromTimestamp);

        const res = await tokenHolder.isAllowedToParticipateNow();
        res.should.equal(true);
    });

    it('should allow users to participate', async () => {
        await token.mint(OTHER, 1000);
        await token.approve(tokenHolder.address, tokensToStake, {from: OTHER});

        const tokensBefore = await token.balanceOf(OTHER);
        const vouchersBefore = await vouchers.balanceOf(OTHER);

        const res = await tokenHolder.participate({from: OTHER});

        expectEvent.inLogs(res.logs, "ParticipationStarted", {
            participant: OTHER,
            mthTokens: tokensToStake
        });

        const tokensAfter = await token.balanceOf(OTHER);
        const vouchersAfter = await vouchers.balanceOf(OTHER);

        tokensBefore.sub(tokensAfter).should.be.bignumber.equal(tokensToStake);
        vouchersAfter.sub(vouchersBefore).should.be.bignumber.equal(0);
    });

    it('should not allow users to redeem if participation is in progress', async () => {
        const res = await tokenHolder.isAllowedToRedeemNow();
        res.should.equal(false);

        await tokenHolder.redeem({from: OTHER}).should.be.rejectedWith(Revert);
    });

    it('should not allow either to participate or redeem within 30 minutes a day after participation started', async () => {
        let participateFromTimestamp = await tokenHolder.participateFromTimestamp();

        await increaseTimeTo(participateFromTimestamp.add(duration.days(1)).add(duration.minutes(15)));

        (await tokenHolder.isAllowedToParticipateNow()).should.equal(false);
        (await tokenHolder.isAllowedToRedeemNow()).should.equal(false);
    });

    it('should check if users are allowed redeem', async () => {
        let participateFromTimestamp = await tokenHolder.participateFromTimestamp();

        await increaseTimeTo(participateFromTimestamp.add(duration.days(1)).add(duration.minutes(35)));

        const res = await tokenHolder.isAllowedToRedeemNow();
        res.should.equal(true);
    });

    it('should not allow users to participate if redeem is in progress', async () => {
        const res = await tokenHolder.isAllowedToParticipateNow();
        res.should.equal(false);

        await token.approve(tokenHolder.address, tokensToStake, {from: OTHER});

        await tokenHolder.participate({from: OTHER}).should.be.rejectedWith(Revert);

        await token.approve(tokenHolder.address, 0, {from: OTHER});
    });

    it('should allow holder of tokens to redeem vouchers and claim tokens', async () => {
        const tokensBefore = await token.balanceOf(OTHER);
        const vouchersBefore = await vouchers.balanceOf(OTHER);

        const res = await tokenHolder.redeem({from: OTHER});

        expectEvent.inLogs(res.logs, "ParticipationStopped", {
            participant: OTHER,
            mthTokens: tokensToStake,
        });
        expectEvent.inLogs(res.logs, "VouchersRedeemed", {
            participant: OTHER,
            vouchers: vouchersBought
        });

        const tokensAfter = await token.balanceOf(OTHER);
        const vouchersAfter = await vouchers.balanceOf(OTHER);

        tokensAfter.sub(tokensBefore).should.be.bignumber.equal(tokensToStake);
        vouchersAfter.sub(vouchersBefore).should.be.bignumber.equal(vouchersBought);
    });

    it('should not allow either to participate or redeem within 30 minutes before next month start', async () => {
        // calculating 15 min before next month start
        let fromTimestamp = await tokenHolder.participateFromTimestamp();
        let [y, m,] = await dateTime.toDate(fromTimestamp);
        m = m.add(1);
        if (m > 12) {
            m = new BigNumber(1);
            y = y.add(1);
        }
        let fifteenMinutesBeforeNextMonthStart = (await dateTime.toTimestamp(y, m, 1)).sub(duration.minutes(15));

        await increaseTimeTo(fifteenMinutesBeforeNextMonthStart);

        (await tokenHolder.isAllowedToParticipateNow()).should.equal(false);
        (await tokenHolder.isAllowedToRedeemNow()).should.equal(false);
    });

    it('should be able to cancel participation by holder successfully', async () => {
        await tokenHolder.sendTransaction({from: VOUCHER, value: value});
        await tokenHolder.sendTransaction({from: VOUCHER2, value: value});

        const tx = await tokenHolder.buyVouchers({from: VOUCHER2});

        expectEvent.inLogs(tx.logs, "VouchersPurchased", {
            vouchers: vouchersBought,
            weis: vouchersWei,
        });

        let participateFromTimestamp = await tokenHolder.participateFromTimestamp();
        await increaseTimeTo(participateFromTimestamp);

        await token.mint(OTHER, 1000);
        await token.approve(tokenHolder.address, tokensToStake, {from: OTHER});

        await tokenHolder.participate({from: OTHER});

        const tokensBefore = await token.balanceOf(OTHER);
        const vouchersBefore = await vouchers.balanceOf(OTHER);

        const cancel = await tokenHolder.cancelParticipation({from: OTHER});

        expectEvent.inLogs(cancel.logs, "ParticipationStopped", {
            participant: OTHER,
            mthTokens: tokensToStake,
        });

        const tokensAfter = await token.balanceOf(OTHER);
        const vouchersAfter = await vouchers.balanceOf(OTHER);

        tokensAfter.sub(tokensBefore).should.be.bignumber.equal(tokensToStake);
        vouchersAfter.sub(vouchersBefore).should.be.bignumber.equal(0);
    });

    shouldBehaveLikeCanReclaimEther(OTHER);
    shouldBehaveLikeCanReclaimTokens(OTHER);
});
