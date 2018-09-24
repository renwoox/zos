const { assertRevert } = require('./helpers/assertRevert');
const expectEvent = require('./helpers/expectEvent');

const BigNumber = web3.BigNumber;

const ZepToken = artifacts.require('ZepToken');
const Vouching = artifacts.require('Vouching');

require('chai')
  .use(require('chai-bignumber')(BigNumber))
  .should();

contract('Vouching', function ([_, tokenOwner, vouchingOwner, developer, transferee, dependencyAddress, anotherDependencyAddress]) {
  const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
  const lotsaZEP = new BigNumber('10e18');
  const minStake = new BigNumber(10);
  const stakeAmount = minStake.times(2);

  it('requires a non-null token', async function () {
    await assertRevert(
      Vouching.new(minStake, ZERO_ADDRESS, { from: vouchingOwner })
    );
  });

  context('with token', async function () {
    const dependencyName = 'dep';

    beforeEach(async function () {
      this.token = await ZepToken.new({ from: tokenOwner });
      await this.token.transfer(developer, lotsaZEP, { from: tokenOwner });
      this.vouching = await Vouching.new(minStake, this.token.address, { from: vouchingOwner });
      await this.token.approve(this.vouching.address, lotsaZEP, { from: developer });
    });

    it('stores the token address', async function () {
      (await this.vouching.token()).should.equal(this.token.address);
    });

    it('stores the minimum stake', async function () {
      (await this.vouching.minimumStake()).should.be.bignumber.equal(minStake);
    });

    describe('dependency creation', function () {
      it('reverts when initial stake is less than the minimum', async function () {
        await assertRevert(
          this.vouching.create(
            dependencyName, developer, dependencyAddress, minStake.minus(1), { from: developer }
          )
        );
      });

      it('reverts for null dependency address', async function () {
        await assertRevert(
          this.vouching.create(dependencyName, developer, ZERO_ADDRESS, minStake, { from: developer })
        );
      });

      it('reverts for null owner address', async function () {
        await assertRevert(
          this.vouching.create(dependencyName, ZERO_ADDRESS, dependencyAddress, stakeAmount, { from: developer })
        );
      });

      it('transfers the initial stake tokens to the vouching contract', async function () {
        const initialBalance = await this.token.balanceOf(this.vouching.address);

        await this.vouching.create(
          dependencyName, developer, dependencyAddress, stakeAmount, { from: developer }
        );

        (await this.token.balanceOf(this.vouching.address)).should.be.bignumber.equal(
          initialBalance.plus(stakeAmount)
        );
      });

      it('emits a DependencyCreated event', async function () {
        const result = await this.vouching.create(
          dependencyName, developer, dependencyAddress, stakeAmount, { from: developer }
        );
        const dependencyCreatedEvent = expectEvent.inLogs(result.logs, 'DependencyCreated', {
          name: dependencyName,
          owner: developer,
          dependencyAddress: dependencyAddress
        });
        dependencyCreatedEvent.args.initialStake.should.be.bignumber.equal(stakeAmount);
      });
    });

    context('with a dependency created', function () {
      beforeEach(async function () {
        await this.vouching.create(
          dependencyName, developer, dependencyAddress, stakeAmount, { from: developer }
        );
      });

      it('reverts when creating new dependency with existing name', async function () {
        await assertRevert(
          this.vouching.create(
            dependencyName, developer, anotherDependencyAddress, stakeAmount, { from: developer }
          )
        );
      });

      it('stores the created dependency', async function () {
        let [addr, dev, amount] = await this.vouching.getDependency(dependencyName);
        addr.should.equal(dependencyAddress);
        dev.should.equal(developer);
        amount.should.be.bignumber.equal(stakeAmount);
      });

      describe('ownership transfer', function () {
        it('reverts when caller is not the dependency\'s owner', async function () {
          await assertRevert(
            this.vouching.transferOwnership(dependencyName, transferee, { from: vouchingOwner })
          );
        });

        it('reverts for null new owner address', async function () {
          await assertRevert(
            this.vouching.transferOwnership(dependencyName, ZERO_ADDRESS, { from: developer })
          );
        });

        it('transfers the dependency\'s ownership to a given address', async function () {
          const result = await this.vouching.transferOwnership(
            dependencyName, transferee, { from: developer }
          );

          (await this.vouching.getDependency(dependencyName))[1].should.equal(transferee);
          expectEvent.inLogs(
            result.logs, 'OwnershipTransferred', { oldOwner: developer, newOwner: transferee }
          );
        });
      });

      describe('vouch', function () {
        it('reverts when caller is not the dependency\'s owner', async function () {
          await assertRevert(
            this.vouching.vouch(dependencyName, stakeAmount, { from: vouchingOwner })
          );
        });

        it('transfers stake amount of tokens from sender to vouching contract', async function () {
          const vouchingInitBalance = await this.token.balanceOf(this.vouching.address);
          const devInitBalance = await this.token.balanceOf(developer);

          await this.vouching.vouch(dependencyName, stakeAmount, { from: developer });

          (await this.token.balanceOf(this.vouching.address)).should.be.bignumber.equal(
            vouchingInitBalance.plus(stakeAmount)
          );
          (await this.token.balanceOf(developer)).should.be.bignumber.equal(
            devInitBalance.minus(stakeAmount)
          );
        });

        it('adds the amount vouched to the existing dependency stake', async function () {
          const initialStake = (await this.vouching.getDependency(dependencyName))[2];

          await this.vouching.vouch(dependencyName, stakeAmount, { from: developer });
          await this.vouching.vouch(dependencyName, stakeAmount, { from: developer });

          (await this.vouching.getDependency(dependencyName))[2].should.be.bignumber.equal(
            initialStake.plus(stakeAmount.times(2))
          );
        });

        it('emits Vouched event', async function () {
          const result = await this.vouching.vouch(dependencyName, stakeAmount, { from: developer });
          const vouchedEvent = expectEvent.inLogs(result.logs, 'Vouched', {
            name: dependencyName
          });
          vouchedEvent.args.amount.should.be.bignumber.equal(stakeAmount);
        });
      });

      describe('unvouch', function () {
        const safeUnstakeAmount = stakeAmount.minus(minStake);

        it('reverts when caller is not the dependency\'s owner', async function () {
          await assertRevert(
            this.vouching.unvouch(dependencyName, safeUnstakeAmount, { from: vouchingOwner })
          );
        });

        it('reverts when the remaining stake amount is less than the minimum', async function () {
          await assertRevert(
            this.vouching.unvouch(dependencyName, safeUnstakeAmount.plus(1), { from: developer })
          );
        });

        it('reverts when the unvouched amount is greater than current stake', async function () {
          await assertRevert(
            this.vouching.unvouch(dependencyName, minStake.plus(1), { from: developer })
          );
        });

        it('extracts the unvouched amount from the dependency\'s stake', async function () {
          const initDependencyStake = (await this.vouching.getDependency(dependencyName))[2];

          await this.vouching.unvouch(dependencyName, safeUnstakeAmount, { from: developer });

          (await this.vouching.getDependency(dependencyName))[2].should.be.bignumber.equal(
            initDependencyStake.minus(safeUnstakeAmount)
          );
        });

        it('transfers the unvouched amount of tokens to the dependency\'s owner', async function () {
          const vouchingInitBalance = await this.token.balanceOf(this.vouching.address);
          const devInitBalance = await this.token.balanceOf(developer);

          await this.vouching.unvouch(dependencyName, safeUnstakeAmount, { from: developer });

          (await this.token.balanceOf(this.vouching.address)).should.be.bignumber.equal(
            vouchingInitBalance.minus(safeUnstakeAmount)
          );
          (await this.token.balanceOf(developer)).should.be.bignumber.equal(
            devInitBalance.plus(safeUnstakeAmount)
          );
        });

        it('emits Unvouched event', async function () {
          const result = await this.vouching.unvouch(dependencyName, safeUnstakeAmount, { from: developer });
          const unvouchedEvent = expectEvent.inLogs(result.logs, 'Unvouched', {
            name: dependencyName
          });
          unvouchedEvent.args.amount.should.be.bignumber.equal(safeUnstakeAmount);
        });
      });

      describe('dependency removal', function () {
        it('reverts when caller is not the dependency\'s owner', async function () {
          await assertRevert(
            this.vouching.remove(dependencyName, { from: vouchingOwner })
          );
        });

        it('transfers the dependency\'s stake to its owner, slashing the minimum stake', async function () {
          const dependencyStakeAmount = (await this.vouching.getDependency(dependencyName))[2];
          const transferredAmount = dependencyStakeAmount.minus(minStake);

          // Check dependency's owner and vouching contract initial token balances
          const developerInitBalance = await this.token.balanceOf(developer);
          const vouchingInitBalance = await this.token.balanceOf(this.vouching.address);

          await this.vouching.remove(dependencyName, { from: developer });

          // Check dependency's owner and vouching contract final token balances
          (await this.token.balanceOf(this.vouching.address)).should.be.bignumber.equal(
            vouchingInitBalance.minus(transferredAmount)
          );
          (await this.token.balanceOf(developer)).should.be.bignumber.equal(
            developerInitBalance.plus(transferredAmount)
          );
        });

        it('removes the dependency from the registry', async function () {
          await this.vouching.remove(dependencyName, { from: developer });
          let [addr, dev, amount] = await this.vouching.getDependency(dependencyName);
          addr.should.equal(ZERO_ADDRESS);
          dev.should.equal(ZERO_ADDRESS);
          amount.should.be.bignumber.equal(0);
        });

        it('emits a DependencyRemoved event', async function () {
          const result = await this.vouching.remove(dependencyName, { from: developer });
          expectEvent.inLogs(result.logs, 'DependencyRemoved', { name: dependencyName });
        });
      });
    });
  });
});
