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
  Experimental,
  // Bool,
  PublicKey,
  // Circuit,
  Poseidon,
} from 'snarkyjs';

const doProofs = true;

await isReady;

type Witness = { isLeft: boolean; sibling: Field }[];

const MerkleTreeHeight = 8;

/** Merkle Tree
 * Instance for global reference. It must be stored off-chain.
 */
const MerkleTree = Experimental.MerkleTree;
const merkleTree = new MerkleTree(MerkleTreeHeight);

class MerkleWitness extends Experimental.MerkleWitness(MerkleTreeHeight) {}

// export class Verifier extends SmartContract {
//   @state(Field) x = State<Field>();

//   @method update(y: Field) {
//     this.emitEvent('update', y);
//     let x = this.x.get();
//     this.x.assertEquals(x);
//     let newX = x.add(y);
//     this.x.set(newX);
//     // return newX;
//   }

//   deploy(args: DeployArgs) {
//     super.deploy(args);
//     this.setPermissions({
//       ...Permissions.default(),
//       editState: Permissions.proofOrSignature(),
//       send: Permissions.proofOrSignature(),
//     });
//     this.balance.addInPlace(UInt64.fromNumber(initialBalance));
//     this.x.set(initialState);
//   }

//   @method verifyProof(merkleProof: MerkleWitness) {
//     //
//   }
// }
let initialIndex: Field = Field.zero;
export class MixerZkApp extends SmartContract {
  @state(Field) x = State<Field>();
  @state(Field) merkleTreeRoot = State<Field>();
  @state(Field) lastIndexAdded = State<Field>();

  deploy(args: DeployArgs) {
    super.deploy(args);
    this.setPermissions({
      ...Permissions.default(),
      editState: Permissions.proofOrSignature(),
      send: Permissions.proofOrSignature(),
    });
    this.balance.addInPlace(UInt64.fromNumber(initialBalance));

    this.x.set(initialState);
    this.merkleTreeRoot.set(merkleTree.getRoot());
    this.lastIndexAdded.set(initialIndex);
  }

  // @method update(y: Field) {
  //   this.emitEvent('update', y);
  //   let x = this.x.get();
  //   this.x.assertEquals(x);
  //   let newX = x.add(y);
  //   this.x.set(newX);
  //   // return newX;
  // }

  @method insertCommitment(commitment: Field) {
    // we fetch the on-chain commitment
    let lastIndexAdded = this.lastIndexAdded.get();
    this.lastIndexAdded.assertEquals(lastIndexAdded);

    console.log('Internal --------------------');
    console.log('this.root --> ', this.merkleTreeRoot.get());
    let indexForNextCommitment = this.lastIndexAdded.get().toBigInt() + 1n;
    merkleTree.setLeaf(indexForNextCommitment, commitment);

    // let newMerkleTreeRoot = merkleTree.getRoot();
    // this.merkleTreeRoot.set(newMerkleTreeRoot);
    // console.log("this.root --> ", this.merkleTreeRoot.get());
  }
}

async function toStr(value: Field) {
  return value.toString();
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
console.log('ZkAppAddress: ', zkappAddress);

initialIndex = new Field(0);
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
  update.send({ to: userAccountAddress, amount: 20 });
  console.log('User account wallet funded');
});

//Sending transaction
console.log('Second TX');
await tx2.send();
console.log('UserWallet funded succesfully');

/**
 * 3. A commitment needs to be created  C(0) = H(S(0),N(0))
 */
let nullifier = await createNullifier(userAccountAddress);
let commitment = await createCommitment(nullifier);
console.log('User PB: ' + JSON.stringify(userAccountAddress));
console.log('User PK: ' + userAccountKey);
console.log(`User balance: ${Mina.getBalance(userAccountAddress)} MINA`);
console.log(
  `Harpo Account Balance: ${Mina.getBalance(harpoFeePayerAccount)} MINA`
);
console.log(`initial balance: ${zkapp.account.balance.get().div(1e9)} MINA`);
console.log(`Nullifier ` + nullifier);
console.log(`Commitment  ` + commitment);

/**
 * Function to create Nullifier Nullifier: H ( Spending Key, rho )
 * Spending key: Public key
 * Rho: Private key
 */

async function createNullifier(publicKey: PublicKey) {
  let keyString = publicKey.toFields();
  let secretField = Field.random();
  let nullifierHash = Poseidon.hash([...keyString, secretField]);

  return nullifierHash;
}

/**
 * Function to create  the Commitment C(0) = H(S(0),N(0))
 */
async function createCommitment(nullifier: any) {
  let secret = Field.random();
  let commitment = Poseidon.hash([nullifier, secret]);
  return commitment;
}
// TODO ADD MERKLE TREE LOGIC
/**
 * 5. After the commitment is added into the merkle Tree and the note is returned, the money should be send to the zkApp account
 *
 */
async function sendFundstoMixer(sender: PrivateKey, amount: any) {
  let tx = await Mina.transaction(harpoFeePayer, () => {
    // AccountUpdate.fundNewAccount(harpoFeePayer);
    let update = AccountUpdate.createSigned(sender);
    //The userAddress is funced
    update.send({ to: zkappAddress, amount: amount });
    console.log('Sendind Funds to  Harpo Wallet');
  });
  await tx.send();
}
/**
 * 
 *Merkle Tree implementation 
 1. Create Merkle Tree instance.  
 2. Wrap  the Merkle Tree into a off-chain storage form 
 3. Set leaf with the Commitment
  Note: What happens if the Merkle tree is full 
 4. Get root of the tree " Initial commitment" Which would be used to verify the transaction // Add to a state variable 
 Withdraw Logic 
 5. Generate merkle tree Witness based on the commitment idndex ( Which comes from the commitment provided)
 6. Verify with the witness that the commitment is part of the merkle tree path. 

 */
//Creating the Merkle wiotness

// // Inserting a commitment in the Merkle Tree
console.log('-------------Inserting a commitment----------------------');
console.log(
  'Merkle tree root (pre insertion)',
  zkapp.merkleTreeRoot.get().toString()
);
console.log('-->', merkleTree.getRoot().toString());
zkapp.insertCommitment(commitment);
console.log('-->', merkleTree.getRoot().toString());
console.log(
  'Merkle tree root (pos insertion)',
  zkapp.merkleTreeRoot.get().toString()
);

// //We will set a experimental commitment to our Merkle Tree
// let testHash = Poseidon.hash([Field.random()]);

// console.log('update');
// tx = await Mina.transaction(harpoFeePayer, () => {
//   zkapp.update(new Field(3));
//   if (!doProofs) zkapp.sign(zkappKey);
// });
// if (doProofs) await tx.prove();
// await tx.send();
