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
  Int64,
} from 'snarkyjs';
import { MerkleTree } from 'snarkyjs/dist/node/lib/merkle_tree';
// import { tic, toc } from './tictoc';
import DepositClass from './proof_system/models/DepositClass.js';
import NullifierClass from './proof_system/models/NullifierClass.js';
import { Events } from 'snarkyjs/dist/node/lib/account_update.js';
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

  events = {
    deposit: DepositClass,
    nullifier: NullifierClass,
  };

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
  //TODO:  Verify Merke Tree before inserting a commitment
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
    //Validating that the root is valid
    newMerkleTreeRoot.assertEquals(newMerkleTree.getRoot());

    //Updating the Merkle Tree root
    this.merkleTreeRoot.set(newMerkleTreeRoot);

    // Updating the index variable
    let newIndex = lastIndex.add(new Field(1));
    console.log('New index', newIndex.toBigInt());
    newIndex.assertEquals(lastIndex.add(new Field(1)));
    this.lastIndexAdded.set(newIndex);

    //Emiting a deposit event
    console.log('Emiting event.....');
    let deposit = {
      commitment: commitment,
      leafIndex: lastIndex,
      //TODO: CHANGE
      timeStamp: new Field(2),
    };
    this.emitEvent('deposit', deposit);
  }
  /**
   * Verification Method for Merkle Tree
   */
  @method verifyMerkleProof(commitment: Field, merkleProof: MerkleWitness) {
    let witnessMerkleRoot = merkleProof.calculateRoot(commitment);
    //TODO: SHOULD COMO OFF-CHAIN
    let merkleTreeRoot = merkleTree.getRoot();
    this.merkleTreeRoot.assertEquals(merkleTreeRoot);

    witnessMerkleRoot.assertEquals(merkleTreeRoot);
  }
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

//TODO: ADD STATE INTERFACE IF NECESSARY
type Interface = {
  // getState(): { commitment1: string; commitment2: string, hits1: string, hits2: string, turn: string, guessX: string, guessY: string };
};

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

//TODO ADD INTEGRATION WITH ARURO WALLET

// Creating a user account that wants to use Harpo
//TODO Replace with real address coming from AurO;
let userAccountKey = PrivateKey.random();
let userAccountAddress = userAccountKey.toPublicKey();

/**
 * Deposit  Logic
 * 1. A Minado  account that will pay the gas fees is funded DONE IN Deploy function
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
async function deposit(amount: Number) {
  //TODO: Should this be INT or UINT?
  // zkapp.updateMerkleTree(Field(9))
  /**
   * 2. A userAccount is  funded with the purpose of depositing into our harpoAccount.
   */
  await depositTestFunds();
  let initialBalanceUser = getAccountBalance(userAccountAddress).toString();
  //TODO: BUG HERE
  let initialBalanceZkApp = getAccountBalance(zkappAddress).toString();
  let initialBalanceFeePayer = getAccountBalance(
    minadoFeePayerAccount
  ).toString();
  console.log(`INTIAL BALANCE USER ACCOUNT:${initialBalanceUser} MINA`);
  console.log(`INTIAL BALANCE ZkApp:${initialBalanceZkApp} MINA`);
  console.log(`INTIAL BALANCE FeePayer:${initialBalanceFeePayer} MINA`);
  /**
   * 3. A commitment needs to be created  C(0) = H(S(0),N(0))
   */
  let nullifier = await createNullifier(userAccountAddress);
  let secret = Field.random();
  let commitment = await createCommitment(nullifier, secret);
  console.log('SECRET => ', secret.toString());
  console.log('NULLIFIER => ', nullifier.toString());
  console.log('COMMITMENT Pre-Insertion =>', commitment.toString());
  console.log('Depositing Test funds ......');

  await updateMerkleTree(commitment);
  //TODO: DELETE
  // let rawEvents = zkapp.fetchEvents();
  // let despositEvents = (await rawEvents).filter((a) => (a.type = `deposit`));
  // let normalizedDepositEvents = normalizeDepositEvents(despositEvents);
  // console.log('NORMALIZED DEPOSIT EVENTTTT=> ', normalizedDepositEvents);
  //TODO: ADD HOW TO GET A COMMITMENT FROM THE RETURNED OBJECT
  // let eventCommitment=despositEvents[0].event.commitment
  //TODO: ADD LOGIC FOR N NUMBER OF EVENTS
  // let commitmentEvent = despositEvents[0].event
  //   .toFields(despositEvents[0].event)[0]
  //   .toString();
  // let leafIndexEvent = despositEvents[0].event
  //   .toFields(despositEvents[0].event)[1]
  //   .toString();
  // let timeStamp = despositEvents[0].event
  //   .toFields(despositEvents[0].event)[2]
  //   .toString();

  await sendFundstoMixer(userAccountKey, amount);
  /**
   * TODO: Add note creation
   */
  const deposit = createDeposit(nullifier, secret);
  const note = {
    currency: 'Mina',
    amount: new UInt64(amount),
    depositPreimage: deposit.preimage,
  };

  const noteString = generateNoteString(note);
  let finalBalanceUser = getAccountBalance(userAccountAddress).toString();
  //TODO: BUG HERE
  let finalBalanceZkApp = getAccountBalance(zkappAddress).toString();
  let finalBalanceFeePayer = getAccountBalance(
    minadoFeePayerAccount
  ).toString();
  console.log(`INTIAL BALANCE USER ACCOUNT:${finalBalanceUser} MINA`);
  console.log(`INTIAL BALANCE ZkApp:${finalBalanceZkApp} MINA`);
  console.log(`INTIAL BALANCE FeePayer:${finalBalanceFeePayer} MINA`);
  return noteString;
}
//TODO: Change type
function normalizeDepositEvents(depositEvent: any) {
  let newEvents = [];
  for (let i = 0; i < depositEvent.length; i++) {
    let element = depositEvent[i].event;
    let eventsNormalized = element.toFields(element);
    //TODO:CHeck if we want this as string
    let object = {
      commitment: eventsNormalized[0].toString(),
      leafIndex: eventsNormalized[1].toString(),
      timeStamp: eventsNormalized[2].toString(),
    };
    newEvents.push(object);
  }
  return newEvents;
}
//TODO: Check why when sending more 100 mina is causing an overflow
//Overflow happens if there is not enough money to cover the gas fees.

async function depositTestFunds() {
  let tx2 = await Mina.transaction(minadoFeePayer, () => {
    AccountUpdate.fundNewAccount(minadoFeePayer);
    let update = AccountUpdate.createSigned(minadoFeePayer);
    update.send({ to: userAccountAddress, amount: 1000 });
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

function getAccountBalance(address: any) {
  return Mina.getBalance(address);
}

/**
 * Function to create Nullifier Nullifier: H ( Spending Key, rho )
 * Spending key: Public key
 * Rho: Private key
 */

async function createNullifier(publicKey: PublicKey) {
  let keyString = publicKey.toFields();
  let secret = Field.random();
  let nullifierHash = Poseidon.hash([...keyString, secret]);

  return nullifierHash;
}

/**
 * Function to create  the Commitment C(0) = H(S(0),N(0))
 */
function createCommitment(nullifier: Field, secret: Field) {
  return Poseidon.hash([nullifier, secret]);
}

/**
 * After the commitment is added into the merkle Tree and the note is returned, the money should be send to the zkApp account
 * @param sender
 * @param amount
 */
async function sendFundstoMixer(sender: PrivateKey, amount: any) {
  let tx = await Mina.transaction(sender, () => {
    let update = AccountUpdate.createSigned(sender);
    //The userAddress is funced
    update.send({ to: zkappAddress, amount: amount });
    console.log('Sendind Funds to  Harpo Wallet');
    //Parece que la zkapp no puede recibir fondos
  });
  await tx.send();
}
/*
Currency, amount, netID, note => deposit(secret, nullifier)
*/
type Deposit = {
  nullifier: Field;
  secret: Field;
  preimage: string;
  commitment: Field;
};

type Note = {
  currency: string;
  amount: UInt64;
  depositPreimage: string;
};

function createDeposit(nullifier: Field, secret: Field): Deposit {
  let deposit = {
    nullifier,
    secret,
    preimage: nullifier.toString().concat(secret.toString()),
    commitment: createCommitment(nullifier, secret),
  };

  return deposit;
}

function createDepositFromPreimage(depositPreimage: string): Deposit {
  const nullifier = new Field(depositPreimage?.slice(0, 31));
  const secret = new Field(depositPreimage?.slice(31, 62));

  return createDeposit(nullifier, secret);
}

function generateNoteString(note: Note): string {
  return `Minado&${note.currency}&${note.amount}&${note.depositPreimage}&Minado`;
}

function parseNoteString(noteString: string): Note {
  const noteRegex =
    /Minado&(?<currency>\w+)&(?<amount>[\d.]+)&0x(?<depositPreimage>[0-9a-fA-F]{124})&Minado/g;
  const match = noteRegex.exec(noteString);

  if (!match) {
    throw new Error('The note has invalid format');
  }

  const depositPreimage = match.groups?.depositPreimage;

  return {
    currency: match.groups?.currency!,
    amount: new UInt64(match.groups?.ammount),
    depositPreimage: depositPreimage!,
  };
}
/**
 * 
 * Withdraw and Merkle Tree implementation 
 * 
 1. Parse note given by the user, validate the note, the address and create a deposit from it. 
 2. Generate Merkle Proof from deposit.  
 3. Validate Merkle Proof and nullifier.Fetch Nullifier events. 
 4. A nullifier event should be created in the moment of withdraw to avoid double spending. 
 */
async function withdraw(noteString: string) {
  let parsedNote = parseNoteString(noteString);
  console.log('NOTE PARSEDD WITHDRAW=>', parsedNote);
  let deposit = createDepositFromPreimage(parsedNote.depositPreimage);
  console.log('DEPOSIT IN WITHDRAW  =>>> ', deposit);
  validateProof(deposit);
}
//TODO: Review these functions.
/**
 *
 * @param deposit Created from a note
 * Should return a Merkle Proof that will be validated by the smart contract
 */
async function validateProof(deposit: Deposit) {
  /**
   * Merkle Tree Validation.
   */
  //Find the commitment in the events
  let depositEvents = await getDepositEvents();
  //TODO: LEAVE AS FIELD IF NECCESARY
  let commitmentDeposit = deposit.commitment.toString();
  console.log('DEPOSIT EVENTS WITHDRAW => ', depositEvents);
  let eventWithCommitment = depositEvents.find(
    (e) => e.commitment === commitmentDeposit
  );
  console.log('NORMALIZED EVENT COMING WITHDRAW', eventWithCommitment);
  let leafIndex = eventWithCommitment?.leafIndex.toBigInt();
  console.log('LEAF INDEXXX coming from event', leafIndex);
  //TODO: Add validations of the event
  //Recostructing the Merkle Tree
  // let merkleTreeWitness = merkleTree.getWitness(leafIndex);
  // let merkleWitness = new MerkleWitness(merkleTreeWitness);

  //  try {
  //   zkapp.verifyProof(commitment, merkleWitness);
  // } catch (e) {
  //   console.log('Proof not valid');
  //   console.log(e);
  //   }
  //Verifying the nullifier
}
async function getDepositEvents() {
  let rawEvents = await zkapp.fetchEvents();
  let despositEvents = (await rawEvents).filter((a) => (a.type = `deposit`));
  let normalizedDepositEvents = normalizeDepositEvents(despositEvents);
  return normalizedDepositEvents;
}
async function getNullifierEvents() {
  let rawEvents = await zkapp.fetchEvents();
  return rawEvents.filter((a) => (a.type = `nullifier`));
}
async function isSpend(nullifier: any) {
  let nullfierEvents = getNullifierEvents();
  console.log('NULLFIER EVENTS => ', nullfierEvents);
}
async function initTest() {
  let noteString = await deposit(100);
  console.log('NOTE STRING FROM DEPOSIT => ', noteString);
  withdraw(noteString);
}
initTest();
// async function verifyTransaction(leafIndex,commitment) {
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
