const { shouldBehaveLikeCanReclaimEther } = require('./CanReclaimEther.behavior');
const { shouldBehaveLikeCanReclaimTokens } = require('./CanReclaimTokens.behavior');

import {advanceBlock} from "./helpers/advanceToBlock";
import Revert from "./helpers/VMExceptionRevert";

const {BigNumber} = require('./helpers/setup');
const expectEvent = require('./helpers/expectEvent');

const MonethaVoucher = artifacts.require("MonethaVoucher");
const Token = artifacts.require("ERC20Mintable");

contract('MonethaVoucher', function (accounts) {

    const OWNER = accounts[0];
    const VOUCHER = accounts[1];
    const VOUCHER2 = accounts[2];
    const USER = accounts[3];
    const OTHER = accounts[4];
    const OTHER1 = accounts[5];

    const voucherMthRate = 1000000000000000000;
    const mthEthRate = 100000000;
    const vouchersToBuy = 10;
    const value = new BigNumber('1e9');

    const newVoucherMthRate = 10000000000000;
    const newMthEthRate = 1000;

    const tokenToMint = 1000000000;

    let vouchers, token;

    before(async () => {
        token = await Token.new();

        vouchers = await MonethaVoucher.new(
            voucherMthRate,
            mthEthRate,
            token.address
        );
        
        await vouchers.setMonethaAddress(VOUCHER, true);
        await vouchers.setMonethaAddress(VOUCHER2, true);
        await vouchers.transferOwnership(OWNER);

        await token.mint(vouchers.address, tokenToMint);

        advanceBlock();
    });

    beforeEach(async function () {
        this.mock = vouchers;
        this.token = token;
    });

    it('should get total number of vouchers in existence', async () => {
        var res = await vouchers.totalSupply();
        res.toNumber().should.equal(tokenToMint);
    });

    it('should be able to buy vouchers', async () => {
        const etherToTransfer = 100000000000;//.mul(RATE_COEFFICIENT2).div(voucherMthEthRate);

        const tx = await vouchers.buyVouchers(vouchersToBuy, {from: VOUCHER2, value: etherToTransfer});

        expectEvent.inLogs(tx.logs, "VouchersBought", {
            user: VOUCHER2,
            vouchersBought: vouchersToBuy,
        });
    });

    it("should not be able to buy vouchers from other acoounts", async function () {
        const etherToTransfer = 100000000000;
        await vouchers.buyVouchers(vouchersToBuy, {from: OTHER, value: etherToTransfer}).should.be.rejectedWith(Revert);
    });

    it('should return the balance of successfully bought vouchers', async () => {
        let voucher2Balance = await vouchers.balanceOf(VOUCHER2);
        voucher2Balance.toNumber().should.equal(vouchersToBuy);
    });

    it('should release purchased vouchers to another address', async () => {
        const tx = await vouchers.releasePurchasedTo(USER, 5, {from: VOUCHER2});

        expectEvent.inLogs(tx.logs, "PurchasedVouchersReleased", {
            from: VOUCHER2,
            to: USER,
            vouchers: 5,
        });

        let userBalance = await vouchers.balanceOf(USER);
        userBalance.toNumber().should.equal(5);
    });


    it("should not be able to release purchased vouchers to another address from other acoounts", async function () {
        await vouchers.releasePurchasedTo(USER, 5, {from: OTHER}).should.be.rejectedWith(Revert);
    });

    it('should return appropriate vouchers present for user', async () => {
        let userBalance = await vouchers.balanceOf(USER);
        let voucher2Balance = await vouchers.balanceOf(VOUCHER2);

        voucher2Balance.toNumber().should.equal(vouchersToBuy - userBalance);

    });

    it('should apply discount correctly and transfer ether', async () => {
        let prevUserBal = await vouchers.balanceOf(USER);
        const prevUserBalEth = new BigNumber(web3.eth.getBalance(USER));
        const tx = await vouchers.applyDiscount(USER, 1, {from: VOUCHER2});
        const expectedAmountWeiTransferred = 10000000000;

        expectEvent.inLogs(tx.logs, "DiscountApplied", {
            user: USER,
            releasedVouchers: 1,
            amountWeiTransferred: expectedAmountWeiTransferred,
        });

        let newUserBalance = await vouchers.balanceOf(USER);
        newUserBalance.toNumber().should.equal(prevUserBal - 1);

        const newUserBalEth = new BigNumber(web3.eth.getBalance(USER));
        newUserBalEth.should.be.bignumber.equal(prevUserBalEth.add(expectedAmountWeiTransferred));
    });

    it('should not apply discount if vouchers released is 0', async () => {
        let prevUserBal = await vouchers.balanceOf(OTHER1);
        const prevUserBalEth = new BigNumber(web3.eth.getBalance(OTHER1));
        
        const tx = await vouchers.applyDiscount(OTHER1, 1, {from: VOUCHER2});

        let newUserBalance = await vouchers.balanceOf(OTHER1);
        newUserBalance.toNumber().should.equal(prevUserBal.toNumber());
        const newUserBalEth = new BigNumber(web3.eth.getBalance(OTHER1));
        newUserBalEth.should.be.bignumber.equal(prevUserBalEth);
    });

    it('should revert when apply discount is called from other account', async () => {
        await vouchers.applyDiscount(USER, 1, {from: OTHER}).should.be.rejectedWith(Revert);
    });

    it('should apply payback correctly for the amount transferred', async () => {
        const prevUserBal1 = await vouchers.balanceOf(USER);

        const tx = await vouchers.applyPayback(USER, 10000000000, {from: VOUCHER2});

        const newUserBalance1 = await vouchers.balanceOf(USER);
        newUserBalance1.toNumber().should.equal(prevUserBal1.toNumber() + 1);

        expectEvent.inLogs(tx.logs, "PaybackApplied", {
            user: USER,
            addedVouchers: 1,
            amountWeiEquivalent: 10000000000,
        });
    });

    it('should revert when apply payback is called from other account', async () => {
        await vouchers.applyPayback(USER, 1, {from: OTHER}).should.be.rejectedWith(Revert);
    });

    it('should be able to sell Vouchers', async () => {
        const userDistributedVoucher = await vouchers.purchasedBy(VOUCHER2);

        var res = await vouchers.sellVouchers(userDistributedVoucher, { from: VOUCHER2 })
       
        expectEvent.inLogs(res.logs, "VouchersSold", {
            user: VOUCHER2,
            vouchersSold: 5,
            amountWeiTransferred: 50000000000,
        });
    })

    it('should not sell Vouchers from other account', async () => {
        const userDistributedVoucher = await vouchers.purchasedBy(VOUCHER2);
        await vouchers.sellVouchers(userDistributedVoucher, {from: OTHER}).should.be.rejectedWith(Revert);
    });

    it('should update Voucher to Monetha rate correctly', async () => {
        const tx = await vouchers.updateVoucherMthRate(newVoucherMthRate, {from: VOUCHER2});

        expectEvent.inLogs(tx.logs, "VoucherMthRateUpdated", {
            oldVoucherMthRate: 10000000000000,
            newVoucherMthRate: newVoucherMthRate,
        });
    });

    it('should not update Voucher to Monetha rate when called from other account', async () => {
        await vouchers.updateVoucherMthRate(newVoucherMthRate, {from: OTHER}).should.be.rejectedWith(Revert);
    });

    it('should update Monetha to Ether rate correctly', async () => {
        const tx = await vouchers.updateMthEthRate(newMthEthRate, {from: VOUCHER2});

        expectEvent.inLogs(tx.logs, "MthEthRateUpdated", {
            oldMthEthRate: 1000,
            newMthEthRate: newMthEthRate,
        });
    });

    it('should not update Monetha to Ether rate when called from other account', async () => {
        await vouchers.updateMthEthRate(newMthEthRate, {from: OTHER}).should.be.rejectedWith(Revert);
    });

    it('should get total number of vouchers in shared Pool', async () => {
        var res = await vouchers.totalInSharedPool();
        res.toNumber().should.equal(9995);
    });

    it('should get total number of vouchers distributed', async () => {
        const userDistributedVoucher = await vouchers.balanceOf(USER);
        var res = await vouchers.totalDistributed();
        res.toNumber().should.equal(userDistributedVoucher.toNumber());
    });

    shouldBehaveLikeCanReclaimEther(OTHER);
    shouldBehaveLikeCanReclaimTokens(OTHER);
});
