import {
  Field,
  state,
  State,
  method,
  UInt64,
  PrivateKey,
  SmartContract,
  Mina,
  AccountUpdate,
  isReady,
  Permissions,
  DeployArgs,
  // Bool,
  PublicKey,
  // Circuit,
  Poseidon,
} from 'snarkyjs';

const doProofs = true;

await isReady;

export class MixerZkApp extends SmartContract {
  @state(Field) x = State<Field>();

  events = {
    update: Field,
    payout: UInt64,
    payoutReceiver: PublicKey,
  };

  deploy(args: DeployArgs) {
    super.deploy(args);
    this.setPermissions({
      ...Permissions.default(),
      editState: Permissions.proofOrSignature(),
      send: Permissions.proofOrSignature(),
    });
    this.balance.addInPlace(UInt64.fromNumber(initialBalance));
    this.x.set(initialState);
  }

  @method update(y: Field) {
    this.emitEvent('update', y);
    let x = this.x.get();
    this.x.assertEquals(x);
    let newX = x.add(y);
    this.x.set(newX);
    // return newX;
  }

  // /**
  //  * This method allows a certain privileged account to claim half of the zkapp balance, but only once
  //  * @param caller the privileged account
  //  */
  // @method payout(caller: PrivateKey) {
  //   // check that caller is the privileged account
  //   let callerAddress = caller.toPublicKey();
  //   // callerAddress.assertEquals(privilegedAddress);

  //   // assert that the caller account is new - this way, payout can only happen once
  //   let callerAccountUpdate = AccountUpdate.defaultAccountUpdate(callerAddress);
  //   callerAccountUpdate.account.isNew.assertEquals(Bool(true));

  //   // pay out half of the zkapp balance to the caller
  //   let balance = this.account.balance.get();
  //   this.account.balance.assertEquals(balance);
  //   // FIXME UInt64.div() doesn't work on variables
  //   let halfBalance = Circuit.witness(UInt64, () =>
  //     balance.toConstant().div(2)
  //   );
  //   this.send({ to: callerAccountUpdate, amount: halfBalance });

  //   // emit some events
  //   this.emitEvent('payoutReceiver', callerAddress);
  //   this.emitEvent('payout', halfBalance);
  // }
}

let Local = Mina.LocalBlockchain();
Mina.setActiveInstance(Local);

// a test account that pays all the fees, and puts additional funds into the zkapp
//For our Mixer case the HarpoFeePayer will be the HarpoAccount
let harpoFeePayer = Local.testAccounts[0].privateKey;
let harpoFeePayerAccount = harpoFeePayer.toPublicKey();

// the Harpo zkapp account
let zkappKey = PrivateKey.random();
let zkappAddress = zkappKey.toPublicKey();

// Creating a user account that wants to use Harpo
//TODO Replace with real address coming from Aura;
let userAccountKey = PrivateKey.random();
let userAccountAddress = userAccountKey.toPublicKey();

//This initial balance will fund our harpoFeePayer
let initialBalance = 10_000_000_000;

// let initialBalance2 = 10_000;
let initialState = Field(1);
let zkapp = new MixerZkApp(zkappAddress);

if (doProofs) {
  console.log('compile');
  await MixerZkApp.compile();
}

/**
 * Deposit  Logic
 * 1. A Harpo account that will pay the gas feeds is funded
 * 2. A userAccount is  funded with the purpose of depositing into our harpoAccount.
 * Note: In a real implementation this would not happen as the account already has a balance
 * 3. A commitment needs to be created  C(0) = H(S(0),N(0))
 * 3.1 A Secret is created using Poseidon
 * 3.2 A Nullifier is created for avoiding double spending
 * 3.3 The Secret and the Nullifier is hashed and the commitment is created
 * 4. Add commitment to the Merkle Tree
 * 5. Send funds from useraccount to MerkleTree
 */
console.log('Deposit Logic Starting ');
console.log('Deploy');
/**
 * 1. A Harpo account that will pay the gas feeds is funded
 */
let tx = await Mina.transaction(harpoFeePayer, () => {
  AccountUpdate.fundNewAccount(harpoFeePayer, { initialBalance });
  //One time deploy
  zkapp.deploy({ zkappKey });
  console.log('ACCOUNTS USER ');
  console.log(userAccountAddress);
});
await tx.send();
console.log('HarpoWallet funded succesfully');

/**
 * 2. A userAccount is  funded with the purpose of depositing into our harpoAccount.
 * Note: Will not happen in a real implementation
 */

let tx2 = await Mina.transaction(harpoFeePayer, () => {
  AccountUpdate.fundNewAccount(harpoFeePayer);
  let update = AccountUpdate.createSigned(harpoFeePayer);
  //The userAddress is funced
  update.send({ to: userAccountAddress, amount: 10 });
  console.log('Funding Harpo Wallet');
});

//Sending transaction
/**
 * 3. A commitment needs to be created  C(0) = H(S(0),N(0))
 */

/**
 * Nullifier: H ( Spending Key, rho )
 * Spending key: Public key
 * Rho: Private key
 */

async function createNullifier(publicKey: PublicKey) {
  let keyString = publicKey.toFields();
  let secretField = Field.random();
  let nullifierHash = Poseidon.hash([...keyString, secretField]);

  // let nullifierField= new Field(nullifier
  return nullifierHash;
}
console.log('Second TX');
await tx2.send();
console.log('UserWallet funded succesfully');
// console.log('initial state: ' + zkapp.x.get());
let accountsHAarpo = zkapp.account;
let nullifier = await createNullifier(userAccountAddress);
console.log('User PB: ' + JSON.stringify(userAccountAddress));
console.log('User PK: ' + userAccountKey);
console.log(`User balance: ${Mina.getBalance(userAccountAddress)} MINA`);
console.log(
  `Harpo Account Balance: ${Mina.getBalance(harpoFeePayerAccount)} MINA`
);
console.log(`initial balance: ${zkapp.account.balance.get().div(1e9)} MINA`);
console.log(`Nullifier ` + nullifier);
/**
 * Creting the Commitment C(0) = H(S(0),N(0))
 */
async function createCommitment(nullifier: any) {
  let secret = Field.random();
  let commitment = Poseidon.hash([nullifier, secret]);
  return commitment;
}

/**
 *Merkle Tree implementation 
 1. Create Merkle Tree witness 
 2.
 */

// console.log('update');
// tx = await Mina.transaction(harpoFeePayer, () => {
//   zkapp.update(new Field(3));
//   if (!doProofs) zkapp.sign(zkappKey);
// });
// if (doProofs) await tx.prove();
// await tx.send();

// // pay more into the zkapp -- this doesn't need a proof
// console.log('receive');
// tx = await Mina.transaction(harpoFeePayer, () => {
//   let payerAccountUpdate = AccountUpdate.createSigned(harpoFeePayer);
//   payerAccountUpdate.send({ to: zkappAddress, amount: UInt64.from(8e9) });
// });
// await tx.send();

// console.log('payout');

// tx = await Mina.transaction(harpoFeePayer, () => {
//   AccountUpdate.fundNewAccount(harpoFeePayer);
//   zkapp.payout(privilegedKey);
//   if (!doProofs) zkapp.sign(zkappKey);
// });
// if (doProofs) await tx.prove();
// await tx.send();

// console.log('final state: ' + zkapp.x.get());
// console.log(`final balance: ${zkapp.account.balance.get().div(1e9)} MINA`);

// console.log('try to payout a second time..');
// tx = await Mina.transaction(harpoFeePayer, () => {
//   zkapp.payout(privilegedKey);
//   if (!doProofs) zkapp.sign(zkappKey);
// });
// try {
//   if (doProofs) await tx.prove();
//   await tx.send();
// } catch (err: any) {
//   console.log('Transaction failed with error', err.message);
// }

// console.log('try to payout to a different account..');
// try {
//   tx = await Mina.transaction(harpoFeePayer, () => {
//     zkapp.payout(Local.testAccounts[2].privateKey);
//     if (!doProofs) zkapp.sign(zkappKey);
//   });
//   if (doProofs) await tx.prove();
//   await tx.send();
// } catch (err: any) {
//   console.log('Transaction failed with error', err.message);
// }

// console.log(
//   `should still be the same final balance: ${zkapp.account.balance
//     .get()
//     .div(1e9)} MINA`
// );
