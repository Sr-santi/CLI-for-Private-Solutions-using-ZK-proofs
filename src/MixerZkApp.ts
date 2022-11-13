import {
  matrixProp,
  CircuitValue,
  Field,
  SmartContract,
  PublicKey,
  method,
  PrivateKey,
  Mina,
  state,
  State,
  isReady,
  Poseidon,
  AccountUpdate,
  Bool,
  Experimental,
  Circuit,
  DeployArgs,
  Permissions,
  UInt64,
} from 'snarkyjs';
import { MerkleTree } from 'snarkyjs/dist/node/lib/merkle_tree';
// import { tic, toc } from './tictoc';

// export { deploy };

await isReady;

type Witness = { isLeft: boolean; sibling: Field }[];

const MerkleTreeHeight = 4;
/** Merkle Tree
 * Instance for global reference. It must be stored off-chain.
 */
const MerkleTreeInit = Experimental.MerkleTree;
const merkleTree = new MerkleTreeInit(MerkleTreeHeight);
class MerkleWitness extends Experimental.MerkleWitness(MerkleTreeHeight) {}
//
let initialIndex: Field = new Field(0n);
export class MixerZkApp extends SmartContract {
  //state variables
  @state(Field) x = State<Field>();
  // @state(Field) merkleTreeVariable = State<MerkleTree>();
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
    this.lastIndexAdded.set(initialIndex);
  }
  @method init() {
    console.log('Initiating Merkle Tree .....');
    const merkleTreeRoot = merkleTree.getRoot();
    // //Setting the state of the Merkle Tree
    this.merkleTreeRoot.set(merkleTreeRoot);
  }
  //
  //TODO  Verify Merke Tree before inserting a commitment
  @method updateMerkleTree(commitment: Field) {
    console.log('Updating the Merkle Tree .....');

    /**
     * Getting Merkle Tree root
     */
    let merkleTreeRoot = this.merkleTreeRoot.get();
    this.merkleTreeRoot.assertEquals(merkleTreeRoot);

    //Getting the last index

    let lastIndex = this.lastIndexAdded.get();
    this.lastIndexAdded.assertEquals(lastIndex);
    let lastIndexFormated = lastIndex.toBigInt();
    console.log(
      'Index where the commitment will be inserted ',
      lastIndexFormated
    );

    //Modifying the Merkle Tree, inserting the commitment

    merkleTree.setLeaf(lastIndexFormated, commitment);
    let newMerkleTree = merkleTree;
    let newMerkleTreeRoot = newMerkleTree.getRoot();
    newMerkleTreeRoot.assertEquals(newMerkleTree.getRoot());

    //Updating the Merkle Tree root
    this.merkleTreeRoot.set(newMerkleTreeRoot);

    // Updating the index variable
    let newIndex = lastIndex.add(new Field(1));
    console.log('New index', newIndex.toBigInt());
    newIndex.assertEquals(lastIndex.add(new Field(1)));
    this.lastIndexAdded.set(newIndex);
  }
  /**
   * Verification Method for Merkle Tree
   */
  // @method verifyProof(commitment: Field, merkleProof: MerkleWitness) {
  // let witnessMerkleRoot = merkleProof.calculateRoot(commitment);

  // let merkleTreeRoot = merkleTree.getRoot();
  // this.merkleTreeRoot.assertEquals(merkleTreeRoot);

  // witnessMerkleRoot.assertEquals(merkleTreeRoot);
  // }
}

// setup
const Local = Mina.LocalBlockchain();
Mina.setActiveInstance(Local);
// a test account that pays all the fees, and puts additional funds into the zkapp
//For our Mixer case the minadoFeePayer will be the HarpoAccount
let minadoFeePayer = Local.testAccounts[0].privateKey;
let minadoFeePayerAccount = minadoFeePayer.toPublicKey();

// ZK APP ACCOUNT
let zkappKey = PrivateKey.random();
let zkappAddress = zkappKey.toPublicKey();
let zkapp = new MixerZkApp(zkappAddress);
//This initial balance will fund our minadoFeePayer
let initialBalance = 10_000_000_000;

//TODO: ADD STATE INTERFACE
type Interface = {
  // getState(): { commitment1: string; commitment2: string, hits1: string, hits2: string, turn: string, guessX: string, guessY: string };
};
let isDeploying = null as null | Interface;

// async function deploy() {
// if (isDeploying) return isDeploying;
// tic('compile');
// let { verificationKey } = await MixerZkApp.compile();
// console.log("VERIFICATION", verificationKey)
// toc();
//TODO ADD MERKLE TREE STATE VARIABLE
// let zkappInterface = {
//   getState() {
//     return getState(zkappAddress);
//   },
// };
console.log('HERE');
let tx = await Mina.transaction(minadoFeePayer, () => {
  AccountUpdate.fundNewAccount(minadoFeePayer, { initialBalance });
  zkapp.deploy({ zkappKey });
  zkapp.init();
  zkapp.sign(zkappKey);
  console.log('Minado wallet funded succesfully');
});
await tx.send().wait();
console.log(
  'Initial state of the merkle tree =>>',
  zkapp.merkleTreeRoot.get().toString()
);

// isDeploying = null;
// return zkappInterface;
// }

//TODO ADD INTEGRATION WITH ARURO WALLET

// Creating a user account that wants to use Harpo
//TODO Replace with real address coming from AurO;
let userAccountKey = PrivateKey.random();
let userAccountAddress = userAccountKey.toPublicKey();

/**
 * Deposit  Logic
 * 1. A Minado  account that will pay the gas feeds is funded DONE IN Deploy function
 * 2. A userAccount is  funded with the purpose of depositing into our harpoAccount.
 * Note: In a real implementation this would not happen as the account already has a balance
 * 3. A commitment needs to be created  C(0) = H(S(0),N(0))
 * 3.1 A Secret is created using Poseidon
 * 3.2 A Nullifier is created for avoiding double spending
 * 3.3 The Secret and the Nullifier is hashed and the commitment is created
 * 4. A note needs to be created
 *
 * 4.1 The first function will be generateNote(currency, ammount, deposit), which will return an object note={currency : currency, deposit: deposit, ammount:ammount}
 * 4.2 Generate not String = Turn note object into string [concataniting strings]
 * 4.3 Recieves notString and parses an object note
 *
 * 4. The Merkle path root must be verified.
 * 5. Add commitment to the Merkle Tree
 * 6. Send funds from useraccount to MerkleTree
 */
/**
 * 2. A userAccount is  funded with the purpose of depositing into our harpoAccount.
 * Note: Will not happen in a real implementation
 * TODO: Replace with Auro wallet Logic
 */
async function deposit() {
  // zkapp.updateMerkleTree(Field(9))

  /**
   * 3. A commitment needs to be created  C(0) = H(S(0),N(0))
   */
  let nullifier = await createNullifier(userAccountAddress);
  let commitment = await createCommitment(nullifier);
  console.log('NULLIFIER => ', nullifier.toString());
  console.log('cOMMITMENT Pre-Insertion =>', commitment.toString());
  console.log('Depositing Test funds ......');
  await depositTestFunds();
  await updateMerkleTree(commitment);
  /**
   * Depositing ttest funcds into an user account
   */
  // await depositTestFunds();

  // const updateMerkleTree =   await Mina.transaction(minadoFeePayer, () => {
  //    zkapp.updateMerkleTree(Field(9));
  //   zkapp.sign(zkappKey);
  //   console.log('New state of Merkle Tree => ', zkapp.x.get().toString())
  //   });
  //   await updateMerkleTree.send().wait()
  //Updating the root of the Merkle Tree
  // let root = new Field(2)
  // zkapp.insertCommitment(commitment);
  // let balance = verifyAccountBalance()
}
deposit();

async function depositTestFunds() {
  let tx2 = await Mina.transaction(minadoFeePayer, () => {
    AccountUpdate.fundNewAccount(minadoFeePayer);
    let update = AccountUpdate.createSigned(minadoFeePayer);
    // zkapp.init();
    //The userAddress is funced
    update.send({ to: userAccountAddress, amount: 20 });
    console.log('User account wallet funded');
  });
  console.log('Second TX');
  await tx2.send();
  console.log('UserWallet funded succesfully');
}

async function updateMerkleTree(commitment: Field) {
  let tx3 = await Mina.transaction(minadoFeePayer, () => {
    zkapp.updateMerkleTree(commitment);
    zkapp.sign(zkappKey);
  });
  await tx3.send();
  const rawMerkleTree = zkapp.merkleTreeRoot.get().toString();
  console.log('POST State Merkle Tree =>>>>>>', rawMerkleTree);
  const newIndex = zkapp.lastIndexAdded.get().toBigInt();
  console.log('POST State Index =>>>>>>', newIndex);
}

function verifyAccountBalance(address: any) {
  let balance = Mina.getBalance(userAccountAddress);
  console.log(`Balance from ${address} = ${balance} MINA`);
  return balance;
}

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
/**
 * Merkle Tree insert commitment function
 *
 */
async function insertCommitment(commitment: Field) {
  // await zkapp.insertCommitment(commitment);
}
/**
 * After the commitment is added into the merkle Tree and the note is returned, the money should be send to the zkApp account
 * @param sender
 * @param amount
 */
async function sendFundstoMixer(sender: PrivateKey, amount: any) {
  let tx = await Mina.transaction(minadoFeePayer, () => {
    // AccountUpdate.fundNewAccount(minadoFeePayer);
    let update = AccountUpdate.createSigned(sender);
    //The userAddress is funced
    update.send({ to: zkappAddress, amount: amount });
    console.log('Sendind Funds to  Harpo Wallet');
  });
  await tx.send();
}

//TODO ADD STATE VARIABLES  + Merkle Tree verification

/**
 * 
 * Withdraw and Merkle Tree implementation 
 1. Create Merkle Tree instance. ( Done in Line 87 )
 2. Set leaf with the Commitment ( Done in the insertCommitment function )
  Note / ToDO : What happens if the Merkle tree is full 
 3. Get root of the tree " Initial commitment" Which would be used to verify the transaction // Add to a state variable 
 Withdraw Logic 
 4. Generate merkle tree Witness based on the commitment idndex ( Which comes from the commitment provided)
 5. Verify with the witness that the commitment is part of the merkle tree path. 

 */
// async function verifyTransaction() {
//   let withdrawTx = await Mina.transaction(zkappKey, () => {
//     let update = AccountUpdate.createSigned(zkappKey);
//     let amountToTransfer = 5;
//     let merkleTreeWitness = merkleTree.getWitness(1n);
//     let merkleWitness = new MerkleWitness(merkleTreeWitness);

//     try {
//       zkapp.verifyProof(commitment, merkleWitness);
//     } catch (e) {
//       console.log('Proof not valid');
//       console.log(e);
//     }

//     update.send({ to: userAccountAddress, amount: amountToTransfer });
//   });
//   await withdrawTx.send();
// }
// function getState(zkappAddress: PublicKey) {
//   let zkapp = new MixerZkapp(zkappAddress);
//   let commitment1 = fieldToHex(zkapp.commitment1.get());
//   let commitment2 = fieldToHex(zkapp.commitment2.get());
//   let hits1 = zkapp.hits1.get().toString();
//   let hits2 = zkapp.hits2.get().toString();
//   let turn = zkapp.turn.get().toString();
//   let guessX = zkapp.guessX.get().toString();
//   let guessY = zkapp.guessY.get().toString();

//   return { commitment1, commitment2, hits1, hits2, turn, guessX, guessY };
// }
