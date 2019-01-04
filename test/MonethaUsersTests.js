import {advanceBlock} from "./helpers/advanceToBlock";
import log from "./helpers/logger";
import Revert from "./helpers/VMExceptionRevert";

const expectEvent = require('./helpers/expectEvent');

const {should} = require('./helpers/setup');

const MonethaUser = artifacts.require("MonethaUsers");

contract("MonethaUsers", function (accounts) {
    const USER_NAME = "Test User1";
    const STAR_SCORE = 500;
    const REPUTATION_SCORE = 4500;
    const SIGNED_DEALS_COUNT = 10;
    const NICKNAME = "Nickname";
    const IS_VERIFIED = false;
    const NEW_USER_NAME = "Test User2";
    const NEW_STAR_SCORE = 700;
    const NEW_REPUTATION_SCORE = 7500;
    const NEW_SIGNED_DEALS_COUNT = 20;
    const NEW_NICKNAME = "Updated nickname";
    const NEW_IS_VERIFIED = true;
    let monethaUser;

    beforeEach(async function () {
        monethaUser = await MonethaUser.new();

        advanceBlock();
    });

    it("should set owner address correctly", async function () {
        (await monethaUser.owner()).should.be.equal(accounts[0]);
    });

    describe("registerUser", function () {
        it("should register new user correctly", async function () {
            const preUserInfo = await monethaUser.users(accounts[1]);

            preUserInfo[0].should.be.equal("");
            preUserInfo[1].toNumber().should.be.equal(0);
            preUserInfo[2].toNumber().should.be.equal(0);

            const tx = await monethaUser.registerUser(
                accounts[1],
                USER_NAME,
                STAR_SCORE,
                REPUTATION_SCORE,
                SIGNED_DEALS_COUNT,
                NICKNAME,
                IS_VERIFIED,
                {
                    from: accounts[0]
                }
            ).should.be.fulfilled;

            const postUserInfo = await monethaUser.users(accounts[1]);

            postUserInfo[0].should.be.equal(USER_NAME);
            postUserInfo[1].toNumber().should.be.equal(STAR_SCORE);
            postUserInfo[2].toNumber().should.be.equal(REPUTATION_SCORE);
            postUserInfo[3].toNumber().should.be.equal(SIGNED_DEALS_COUNT);
            postUserInfo[4].should.be.equal(NICKNAME);
            postUserInfo[5].should.be.equal(IS_VERIFIED);

            //CHECKING EVENTS
            expectEvent.inLogs(tx.logs, "UserRegistered", {
                _userAddress: accounts[1],
                _name: USER_NAME,
                _starScore: STAR_SCORE,
                _reputationScore: REPUTATION_SCORE,
                _signedDealsCount: SIGNED_DEALS_COUNT,
                _nickname: NICKNAME,
                _isVerified: IS_VERIFIED,
            });
        });

        it("should not register user by other accounts", async function () {
            await monethaUser
                .registerUser(accounts[1], USER_NAME, STAR_SCORE, REPUTATION_SCORE, SIGNED_DEALS_COUNT, NICKNAME, IS_VERIFIED, {
                    from: accounts[1]
                })
                .should.be.rejectedWith(Revert);
        });
    });

    describe("updateStarScore", function () {
        beforeEach(async function () {
            await monethaUser.registerUser(
                accounts[1],
                USER_NAME,
                STAR_SCORE,
                REPUTATION_SCORE,
                SIGNED_DEALS_COUNT,
                NICKNAME,
                IS_VERIFIED,
                {
                    from: accounts[0]
                }
            ).should.be.fulfilled;
        });

        it("should change start score correctly", async function () {
            const preStarScore = (await monethaUser.users(accounts[1]))[1];

            preStarScore.toNumber().should.be.equal(STAR_SCORE);

            const tx = await monethaUser.updateStarScore(accounts[1], NEW_STAR_SCORE, {
                from: accounts[0]
            }).should.be.fulfilled;

            const postStarScore = (await monethaUser.users(accounts[1]))[1];

            postStarScore.toNumber().should.be.equal(NEW_STAR_SCORE);

            //CHECKING EVENTS
            expectEvent.inLogs(tx.logs, "UpdatedStarScore", {
                _userAddress: accounts[1],
                _newStarScore: NEW_STAR_SCORE,
            });
        });

        it("should not change start score by other accounts", async function () {
            await monethaUser
                .updateStarScore(accounts[1], NEW_STAR_SCORE, {
                    from: accounts[1]
                })
                .should.be.rejectedWith(Revert);
        });
    });

    describe("updateReputationScore", function () {
        beforeEach(async function () {
            await monethaUser.registerUser(
                accounts[1],
                USER_NAME,
                STAR_SCORE,
                REPUTATION_SCORE,
                SIGNED_DEALS_COUNT,
                NICKNAME,
                IS_VERIFIED,
                {
                    from: accounts[0]
                }
            ).should.be.fulfilled;
        });

        it("should change reputation score correctly", async function () {
            const preReputationScore = (await monethaUser.users(accounts[1]))[2];
            preReputationScore.toNumber().should.be.equal(REPUTATION_SCORE);

            const tx = await monethaUser.updateReputationScore(
                accounts[1],
                NEW_REPUTATION_SCORE,
                {
                    from: accounts[0]
                }
            ).should.be.fulfilled;

            const postReputationScore = (await monethaUser.users(accounts[1]))[2];
            postReputationScore.toNumber().should.be.equal(NEW_REPUTATION_SCORE);

            //CHECKING EVENTS
            expectEvent.inLogs(tx.logs, "UpdatedReputationScore", {
                _userAddress: accounts[1],
                _newReputationScore: NEW_REPUTATION_SCORE,
            });
        });

        it("should not change reputation score by other accounts", async function () {
            await monethaUser
                .updateReputationScore(accounts[1], NEW_REPUTATION_SCORE, {
                    from: accounts[1]
                })
                .should.be.rejectedWith(Revert);
        });
    });

    describe("updateSignedDealsCount", function () {
        beforeEach(async function () {
            await monethaUser.registerUser(
                accounts[1],
                USER_NAME,
                STAR_SCORE,
                REPUTATION_SCORE,
                SIGNED_DEALS_COUNT,
                NICKNAME,
                IS_VERIFIED,
                {
                    from: accounts[0]
                }
            ).should.be.fulfilled;
        });

        it("should change signed deals count correctly", async function () {
            const preSignedDealsCount = (await monethaUser.users(accounts[1]))[3];
            preSignedDealsCount.toNumber().should.be.equal(SIGNED_DEALS_COUNT);

            const tx = await monethaUser.updateSignedDealsCount(
                accounts[1],
                NEW_SIGNED_DEALS_COUNT,
                {
                    from: accounts[0]
                }
            ).should.be.fulfilled;

            const postSignedDealsCount = (await monethaUser.users(accounts[1]))[3];
            postSignedDealsCount.toNumber().should.be.equal(NEW_SIGNED_DEALS_COUNT);

            //CHECKING EVENTS
            expectEvent.inLogs(tx.logs, "UpdatedSignedDealsCount", {
                _userAddress: accounts[1],
                _newSignedDealsCount: NEW_SIGNED_DEALS_COUNT,
            });
        });

        it("should not change signed deals count by other accounts", async function () {
            await monethaUser
                .updateSignedDealsCount(accounts[1], NEW_SIGNED_DEALS_COUNT, {
                    from: accounts[1]
                })
                .should.be.rejectedWith(Revert);
        });
    });

    describe("updateSignedDealsCountInBulk", function () {
        beforeEach(async function () {
            for (let i = 0; i < 10; i++) {
                await monethaUser.registerUser(
                    accounts[i],
                    USER_NAME,
                    STAR_SCORE,
                    REPUTATION_SCORE,
                    SIGNED_DEALS_COUNT,
                    NICKNAME,
                    IS_VERIFIED,
                    {
                        from: accounts[0]
                    }
                ).should.be.fulfilled;
            }
        });

        it("should change signed deal count for multiple users", async function () {
            for (let i = 0; i < 10; i++) {
                let preUserInfo = await monethaUser.users(accounts[i]);
                preUserInfo[3].toNumber().should.be.equal(SIGNED_DEALS_COUNT);
            }
            const tx = await monethaUser.updateSignedDealsCountInBulk(
                accounts,
                [
                    NEW_SIGNED_DEALS_COUNT,
                    NEW_SIGNED_DEALS_COUNT,
                    NEW_SIGNED_DEALS_COUNT,
                    NEW_SIGNED_DEALS_COUNT,
                    NEW_SIGNED_DEALS_COUNT,
                    NEW_SIGNED_DEALS_COUNT,
                    NEW_SIGNED_DEALS_COUNT,
                    NEW_SIGNED_DEALS_COUNT,
                    NEW_SIGNED_DEALS_COUNT,
                    NEW_SIGNED_DEALS_COUNT
                ],
                {
                    from: accounts[0]
                }
            ).should.be.fulfilled;

            for (let i = 0; i < 10; i++) {
                let preUserInfo = await monethaUser.users(accounts[i]);
                preUserInfo[3].toNumber().should.be.equal(NEW_SIGNED_DEALS_COUNT);
            }

            //CHECKING EVENTS
            for (let i = 0; i < 10; i++) {
                let event = tx.logs.find(
                    e => e.event === "UpdatedSignedDealsCount" && e.logIndex === i
                );
                should.exist(event);
                event.args._userAddress.should.equal(accounts[i]);
                event.args._newSignedDealsCount
                    .toNumber()
                    .should.be.equal(NEW_SIGNED_DEALS_COUNT);
            }
        });
        it("should not change signed deals count by other accounts", async function () {
            await monethaUser
                .updateSignedDealsCountInBulk(
                    [accounts[1]],
                    [NEW_SIGNED_DEALS_COUNT],
                    {
                        from: accounts[1]
                    }
                )
                .should.be.rejectedWith(Revert);
        });
    });

    describe("updateNickname", function () {
        beforeEach(async function () {
            await monethaUser.registerUser(
                accounts[1],
                USER_NAME,
                STAR_SCORE,
                REPUTATION_SCORE,
                SIGNED_DEALS_COUNT,
                NICKNAME,
                IS_VERIFIED,
                {
                    from: accounts[0]
                }
            ).should.be.fulfilled;
        });

        it("should change nickname correctly", async function () {
            const preNickname = (await monethaUser.users(accounts[1]))[4];
            preNickname.should.be.equal(NICKNAME);

            const tx = await monethaUser.updateNickname(
                accounts[1],
                NEW_NICKNAME,
                {
                    from: accounts[0]
                }
            ).should.be.fulfilled;

            const postNickname = (await monethaUser.users(accounts[1]))[4];
            postNickname.should.be.equal(NEW_NICKNAME);

            //CHECKING EVENTS
            const event = tx.logs.find(e => e.event === "UpdatedNickname");
            should.exist(event);
            event.args._userAddress.should.equal(accounts[1]);
            event.args._newNickname
                .should.be.equal(NEW_NICKNAME);
        });

        it("should not change nickname by other accounts", async function () {
            await monethaUser
                .updateNickname(accounts[1], NEW_NICKNAME, {
                    from: accounts[1]
                })
                .should.be.rejectedWith(Revert);
        });
    });

    describe("updateIsVerified", function () {
        beforeEach(async function () {
            await monethaUser.registerUser(
                accounts[1],
                USER_NAME,
                STAR_SCORE,
                REPUTATION_SCORE,
                SIGNED_DEALS_COUNT,
                NICKNAME,
                IS_VERIFIED,
                {
                    from: accounts[0]
                }
            ).should.be.fulfilled;
        });

        it("should change verification status correctly", async function () {
            const preIsVerified = (await monethaUser.users(accounts[1]))[5];
            preIsVerified.should.be.equal(IS_VERIFIED);

            const tx = await monethaUser.updateIsVerified(
                accounts[1],
                NEW_IS_VERIFIED,
                {
                    from: accounts[0]
                }
            ).should.be.fulfilled;

            const postIsVerified = (await monethaUser.users(accounts[1]))[5];
            postIsVerified.should.be.equal(NEW_IS_VERIFIED);

            //CHECKING EVENTS
            const event = tx.logs.find(e => e.event === "UpdatedIsVerified");
            should.exist(event);
            event.args._userAddress.should.equal(accounts[1]);
            event.args._newIsVerified

                .should.be.equal(NEW_IS_VERIFIED);
        });

        it("should not change verification status by other accounts", async function () {
            await monethaUser
                .updateIsVerified(accounts[1], NEW_IS_VERIFIED, {
                    from: accounts[1]
                })
                .should.be.rejectedWith(Revert);
        });
    });

    describe("updateIsVerifiedInBulk", function () {
        beforeEach(async function () {
            for (let i = 0; i < 10; i++) {
                await monethaUser.registerUser(
                    accounts[i],
                    USER_NAME,
                    STAR_SCORE,
                    REPUTATION_SCORE,
                    SIGNED_DEALS_COUNT,
                    NICKNAME,
                    IS_VERIFIED,
                    {
                        from: accounts[0]
                    }
                ).should.be.fulfilled;
            }
        });

        it("should change is verified for multiple users", async function () {
            for (let i = 0; i < 10; i++) {
                let preUserInfo = await monethaUser.users(accounts[i]);
                preUserInfo[5].should.be.equal(IS_VERIFIED);
            }
            const tx = await monethaUser.updateIsVerifiedInBulk(
                accounts,
                [
                    NEW_IS_VERIFIED,
                    NEW_IS_VERIFIED,
                    NEW_IS_VERIFIED,
                    NEW_IS_VERIFIED,
                    NEW_IS_VERIFIED,
                    NEW_IS_VERIFIED,
                    NEW_IS_VERIFIED,
                    NEW_IS_VERIFIED,
                    NEW_IS_VERIFIED,
                    NEW_IS_VERIFIED
                ],
                {
                    from: accounts[0]
                }
            ).should.be.fulfilled;

            for (let i = 0; i < 10; i++) {
                let preUserInfo = await monethaUser.users(accounts[i]);
                preUserInfo[5].should.be.equal(NEW_IS_VERIFIED);
            }

            //CHECKING EVENTS
            for (let i = 0; i < 10; i++) {
                let event = tx.logs.find(
                    e => e.event === "UpdatedIsVerified" && e.logIndex === i
                );
                should.exist(event);
                event.args._userAddress.should.equal(accounts[i]);
                event.args._newIsVerified

                    .should.be.equal(NEW_IS_VERIFIED);
            }
        });
        it("should not change verification status by other accounts", async function () {
            await monethaUser
                .updateIsVerifiedInBulk(
                    [accounts[1]],
                    [NEW_IS_VERIFIED],
                    {
                        from: accounts[1]
                    }
                )
                .should.be.rejectedWith(Revert);
        });
    });

    describe("updateUserDetailsInBulk", function () {
        beforeEach(async function () {
            for (let i = 0; i < 10; i++) {
                await monethaUser.registerUser(
                    accounts[i],
                    USER_NAME,
                    STAR_SCORE,
                    REPUTATION_SCORE,
                    SIGNED_DEALS_COUNT,
                    NICKNAME,
                    IS_VERIFIED,
                    {
                        from: accounts[0]
                    }
                ).should.be.fulfilled;
            }
        });

        it("should change user star , reputation and signed deal count for multiple users", async function () {
            for (let i = 0; i < 10; i++) {
                let preUserInfo = await monethaUser.users(accounts[i]);
                preUserInfo[1].toNumber().should.be.equal(STAR_SCORE);
                preUserInfo[2].toNumber().should.be.equal(REPUTATION_SCORE);
                preUserInfo[3].toNumber().should.be.equal(SIGNED_DEALS_COUNT);
                preUserInfo[4].should.be.equal(NICKNAME);
                preUserInfo[5].should.be.equal(IS_VERIFIED);
            }
            const tx = await monethaUser.updateUserDetailsInBulk(
                accounts,
                [
                    NEW_STAR_SCORE,
                    NEW_STAR_SCORE,
                    NEW_STAR_SCORE,
                    NEW_STAR_SCORE,
                    NEW_STAR_SCORE,
                    NEW_STAR_SCORE,
                    NEW_STAR_SCORE,
                    NEW_STAR_SCORE,
                    NEW_STAR_SCORE,
                    NEW_STAR_SCORE
                ],
                [
                    NEW_REPUTATION_SCORE,
                    NEW_REPUTATION_SCORE,
                    NEW_REPUTATION_SCORE,
                    NEW_REPUTATION_SCORE,
                    NEW_REPUTATION_SCORE,
                    NEW_REPUTATION_SCORE,
                    NEW_REPUTATION_SCORE,
                    NEW_REPUTATION_SCORE,
                    NEW_REPUTATION_SCORE,
                    NEW_REPUTATION_SCORE
                ],
                [
                    NEW_SIGNED_DEALS_COUNT,
                    NEW_SIGNED_DEALS_COUNT,
                    NEW_SIGNED_DEALS_COUNT,
                    NEW_SIGNED_DEALS_COUNT,
                    NEW_SIGNED_DEALS_COUNT,
                    NEW_SIGNED_DEALS_COUNT,
                    NEW_SIGNED_DEALS_COUNT,
                    NEW_SIGNED_DEALS_COUNT,
                    NEW_SIGNED_DEALS_COUNT,
                    NEW_SIGNED_DEALS_COUNT
                ],
                [
                    NEW_IS_VERIFIED,
                    NEW_IS_VERIFIED,
                    NEW_IS_VERIFIED,
                    NEW_IS_VERIFIED,
                    NEW_IS_VERIFIED,
                    NEW_IS_VERIFIED,
                    NEW_IS_VERIFIED,
                    NEW_IS_VERIFIED,
                    NEW_IS_VERIFIED,
                    NEW_IS_VERIFIED
                ],
                {
                    from: accounts[0]
                }
            ).should.be.fulfilled;

            for (let i = 0; i < 10; i++) {
                let preUserInfo = await monethaUser.users(accounts[i]);
                preUserInfo[1].toNumber().should.be.equal(NEW_STAR_SCORE);
                preUserInfo[2].toNumber().should.be.equal(NEW_REPUTATION_SCORE);
                preUserInfo[3].toNumber().should.be.equal(NEW_SIGNED_DEALS_COUNT);
                preUserInfo[5].should.be.equal(NEW_IS_VERIFIED);
            }

            //CHECKING EVENTS
            for (let i = 0; i < 10; i++) {
                let event = tx.logs.find(
                    e => e.event === "UpdatedUserDetails" && e.logIndex === i
                );
                should.exist(event);
                event.args._userAddress.should.equal(accounts[i]);
                event.args._newStarScore.toNumber().should.be.equal(NEW_STAR_SCORE);
                event.args._newReputationScore
                    .toNumber()
                    .should.be.equal(NEW_REPUTATION_SCORE);
                event.args._newSignedDealsCount
                    .toNumber()
                    .should.be.equal(NEW_SIGNED_DEALS_COUNT);
                event.args._newIsVerified

                    .should.be.equal(NEW_IS_VERIFIED);
            }
        });
        it("should not change users star, reputation and signed deals count by other accounts", async function () {
            await monethaUser
                .updateUserDetailsInBulk(
                    [accounts[1]],
                    [NEW_STAR_SCORE],
                    [NEW_REPUTATION_SCORE],
                    [NEW_SIGNED_DEALS_COUNT],
                    [NEW_IS_VERIFIED],
                    {
                        from: accounts[1]
                    }
                )
                .should.be.rejectedWith(Revert);
        });
    });

    describe("updateTrustScore", function () {
        beforeEach(async function () {
            await monethaUser.registerUser(
                accounts[1],
                USER_NAME,
                STAR_SCORE,
                REPUTATION_SCORE,
                SIGNED_DEALS_COUNT,
                NICKNAME,
                IS_VERIFIED,
                {
                    from: accounts[0]
                }
            ).should.be.fulfilled;
        });

        it("should change user star and reputation score correctly", async function () {
            const preUserInfo = await monethaUser.users(accounts[1]);
            preUserInfo[1].toNumber().should.be.equal(STAR_SCORE);
            preUserInfo[2].toNumber().should.be.equal(REPUTATION_SCORE);

            const tx = await monethaUser.updateTrustScore(
                accounts[1],
                NEW_STAR_SCORE,
                NEW_REPUTATION_SCORE,
                {
                    from: accounts[0]
                }
            ).should.be.fulfilled;

            const postUserInfo = await monethaUser.users(accounts[1]);
            postUserInfo[1].toNumber().should.be.equal(NEW_STAR_SCORE);
            postUserInfo[2].toNumber().should.be.equal(NEW_REPUTATION_SCORE);

            //CHECKING EVENTS
            const event = tx.logs.find(e => e.event === "UpdatedTrustScore");
            should.exist(event);
            event.args._userAddress.should.equal(accounts[1]);
            event.args._newStarScore.toNumber().should.be.equal(NEW_STAR_SCORE);
            event.args._newReputationScore
                .toNumber()
                .should.be.equal(NEW_REPUTATION_SCORE);
        });

        it("should not change user star and reputation score by other accounts", async function () {
            await monethaUser
                .updateTrustScore(accounts[1], NEW_STAR_SCORE, NEW_REPUTATION_SCORE, {
                    from: accounts[1]
                })
                .should.be.rejectedWith(Revert);
        });
    });

    describe("updateName", function () {
        beforeEach(async function () {
            await monethaUser.registerUser(
                accounts[1],
                USER_NAME,
                STAR_SCORE,
                REPUTATION_SCORE,
                SIGNED_DEALS_COUNT,
                NICKNAME,
                IS_VERIFIED,
                {
                    from: accounts[0]
                }
            ).should.be.fulfilled;
        });

        it("should change name correctly", async function () {
            const preName = (await monethaUser.users(accounts[1]))[0];
            preName.should.be.equal(USER_NAME);

            const tx = await monethaUser.updateName(accounts[1], NEW_USER_NAME, {
                from: accounts[0]
            }).should.be.fulfilled;

            const postName = (await monethaUser.users(accounts[1]))[0];
            postName.should.be.equal(NEW_USER_NAME);

            //CHECKING EVENTS
            const event = tx.logs.find(e => e.event === "UpdatedName");
            should.exist(event);
            event.args._userAddress.should.equal(accounts[1]);
            event.args._newName.should.be.equal(NEW_USER_NAME);
        });

        it("should not change name by other accounts", async function () {
            await monethaUser
                .updateName(accounts[1], NEW_USER_NAME, {
                    from: accounts[1]
                })
                .should.be.rejectedWith(Revert);
        });
    });

    describe("updateTrustScoreInBulk", function () {
        beforeEach(async function () {
            for (let i = 0; i < 10; i++) {
                await monethaUser.registerUser(
                    accounts[i],
                    USER_NAME,
                    STAR_SCORE,
                    REPUTATION_SCORE,
                    SIGNED_DEALS_COUNT,
                    NICKNAME,
                    IS_VERIFIED,
                    {
                        from: accounts[0]
                    }
                ).should.be.fulfilled;
            }
        });

        it("should change user star and reputation score for multiple users", async function () {
            for (let i = 0; i < 10; i++) {
                let preUserInfo = await monethaUser.users(accounts[i]);
                preUserInfo[1].toNumber().should.be.equal(STAR_SCORE);
                preUserInfo[2].toNumber().should.be.equal(REPUTATION_SCORE);
            }
            const tx = await monethaUser.updateTrustScoreInBulk(
                accounts,
                [
                    NEW_STAR_SCORE,
                    NEW_STAR_SCORE,
                    NEW_STAR_SCORE,
                    NEW_STAR_SCORE,
                    NEW_STAR_SCORE,
                    NEW_STAR_SCORE,
                    NEW_STAR_SCORE,
                    NEW_STAR_SCORE,
                    NEW_STAR_SCORE,
                    NEW_STAR_SCORE
                ],
                [
                    NEW_REPUTATION_SCORE,
                    NEW_REPUTATION_SCORE,
                    NEW_REPUTATION_SCORE,
                    NEW_REPUTATION_SCORE,
                    NEW_REPUTATION_SCORE,
                    NEW_REPUTATION_SCORE,
                    NEW_REPUTATION_SCORE,
                    NEW_REPUTATION_SCORE,
                    NEW_REPUTATION_SCORE,
                    NEW_REPUTATION_SCORE
                ],
                {
                    from: accounts[0]
                }
            ).should.be.fulfilled;

            for (let i = 0; i < 10; i++) {
                let preUserInfo = await monethaUser.users(accounts[i]);
                preUserInfo[1].toNumber().should.be.equal(NEW_STAR_SCORE);
                preUserInfo[2].toNumber().should.be.equal(NEW_REPUTATION_SCORE);
            }

            //CHECKING EVENTS
            for (let i = 0; i < 10; i++) {
                let event = tx.logs.find(
                    e => e.event === "UpdatedTrustScore" && e.logIndex === i
                );
                should.exist(event);
                event.args._userAddress.should.equal(accounts[i]);
                event.args._newStarScore.toNumber().should.be.equal(NEW_STAR_SCORE);
                event.args._newReputationScore
                    .toNumber()
                    .should.be.equal(NEW_REPUTATION_SCORE);
            }
        });
        it("should not change users star and reputation scores by other accounts", async function () {
            await monethaUser
                .updateTrustScoreInBulk(
                    [accounts[1]],
                    [NEW_STAR_SCORE],
                    [NEW_REPUTATION_SCORE],
                    {
                        from: accounts[1]
                    }
                )
                .should.be.rejectedWith(Revert);
        });
    });

    describe("updateUser", function () {
        beforeEach(async function () {
            await monethaUser.registerUser(
                accounts[1],
                USER_NAME,
                STAR_SCORE,
                REPUTATION_SCORE,
                SIGNED_DEALS_COUNT,
                NICKNAME,
                IS_VERIFIED,
                {
                    from: accounts[0]
                }
            ).should.be.fulfilled;
        });

        it("should change user details correctly", async function () {
            const preUserInfo = await monethaUser.users(accounts[1]);
            preUserInfo[0].should.be.equal(USER_NAME);
            preUserInfo[1].toNumber().should.be.equal(STAR_SCORE);
            preUserInfo[2].toNumber().should.be.equal(REPUTATION_SCORE);
            preUserInfo[3].toNumber().should.be.equal(SIGNED_DEALS_COUNT);
            preUserInfo[4].should.be.equal(NICKNAME);
            preUserInfo[5].should.be.equal(IS_VERIFIED);

            const tx = await monethaUser.updateUser(
                accounts[1],
                NEW_USER_NAME,
                NEW_STAR_SCORE,
                NEW_REPUTATION_SCORE,
                NEW_SIGNED_DEALS_COUNT,
                NEW_NICKNAME,
                NEW_IS_VERIFIED,
                {
                    from: accounts[0]
                }
            ).should.be.fulfilled;

            const postUserInfo = await monethaUser.users(accounts[1]);
            postUserInfo[0].should.be.equal(NEW_USER_NAME);
            postUserInfo[1].toNumber().should.be.equal(NEW_STAR_SCORE);
            postUserInfo[2].toNumber().should.be.equal(NEW_REPUTATION_SCORE);
            postUserInfo[3].toNumber().should.be.equal(NEW_SIGNED_DEALS_COUNT);
            postUserInfo[4].should.be.equal(NEW_NICKNAME);
            postUserInfo[5].should.be.equal(NEW_IS_VERIFIED);

            //CHECKING EVENTS
            const event = tx.logs.find(e => e.event === "UpdatedUser");
            should.exist(event);
            event.args._userAddress.should.equal(accounts[1]);
            event.args._name.should.be.equal(NEW_USER_NAME);
            event.args._newStarScore.toNumber().should.be.equal(NEW_STAR_SCORE);
            event.args._newReputationScore
                .toNumber()
                .should.be.equal(NEW_REPUTATION_SCORE);
            event.args._newSignedDealsCount.toNumber().should.be.equal(NEW_SIGNED_DEALS_COUNT);
            event.args._newNickname.should.be.equal(NEW_NICKNAME);
            event.args._newIsVerified.should.be.equal(NEW_IS_VERIFIED);
        });

        it("should not change user details by other accounts", async function () {
            await monethaUser
                .updateUser(accounts[1], NEW_USER_NAME, NEW_STAR_SCORE, NEW_REPUTATION_SCORE, NEW_SIGNED_DEALS_COUNT, NEW_NICKNAME, NEW_IS_VERIFIED, {
                    from: accounts[1]
                })
                .should.be.rejectedWith(Revert);
        });
    });
});
