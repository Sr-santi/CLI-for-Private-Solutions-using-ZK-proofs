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
  MerkleTree,
  Signature,
} from 'snarkyjs';
import {
  OffChainStorage,
  MerkleWitness8,
} from 'experimental-zkapp-offchain-storage';
import DepositClass from './proof_system/models/DepositClass.js';
import NullifierClass from './proof_system/models/NullifierClass.js';
import { Events } from 'snarkyjs/dist/node/lib/account_update.js';
// import fs from 'fs';
// import XMLHttpRequestTs, { XMLHttpRequest } from 'xmlhttprequest-ts';
// const NodeXMLHttpRequest =XMLHttpRequestTs.XMLHttpRequest as any as typeof XMLHttpRequest
// export { deploy };

await isReady;
//   export {
//     deploy,
//     depositTestFunds,
//     deposit,
//     getAccountBalance,
//     getAccountBalanceString,
//     returnAddresses,
//     withdraw,
//   };

type Witness = { isLeft: boolean; sibling: Field }[];

const MerkleTreeHeight = 8;
/** Merkle Tree
 * Instance for global reference. It must be stored off-chain.
 */
const MerkleTreeInit = MerkleTree;
const merkleTree = new MerkleTreeInit(MerkleTreeHeight);
// class MerkleWitness extends MerkleWitness(MerkleTreeHeight) {}
//
let initialIndex: Field = new Field(0n);
function normalizeNullifier(nullifierEvent: any) {
  let newEvents = [];
  for (let i = 0; i < nullifierEvent.length; i++) {
    let element = nullifierEvent[i].event;
    let eventsNormalized = element.toFields(element);
    //TODO:CHeck if we want this as string
    let object = {
      nullifier: eventsNormalized[0],
      timeStamp: Field,
    };
    newEvents.push(object);
  }
  return newEvents;
}
export class MixerZkApp extends SmartContract {
  //state variables
  @state(Field) x = State<Field>();
  // @state(Field) merkleTreeVariable = State<MerkleTree>();
  @state(Field) merkleTreeRoot = State<Field>();
  @state(Field) lastIndexAdded = State<Field>();
  //State variables offchain storage
  @state(PublicKey) storageServerPublicKey = State<PublicKey>();
  @state(Field) storageNumber = State<Field>();
  @state(Field) storageTreeRoot = State<Field>();

  events = {
    deposit: DepositClass,
    nullifier: NullifierClass,
  };

  async deploy(args: DeployArgs) {
    super.deploy(args);
    this.setPermissions({
      ...Permissions.default(),
      editState: Permissions.proofOrSignature(),
      send: Permissions.proofOrSignature(),
    });
    // let serverPublicKey = await offChainStorageSetup()
    //TODO: Check the functionality of this line
    this.lastIndexAdded.set(initialIndex);
  }
  @method initState() {
    console.log('Initiating Merkle Tree .....');
    const merkleTreeRoot = merkleTree.getRoot();
    // this.storageServerPublicKey.set();
    //Setting the state of the Merkle Tree
    //TODO: DELETE
    this.merkleTreeRoot.set(merkleTreeRoot);
    const emptyTreeRoot = new MerkleTree(8).getRoot();
    this.storageTreeRoot.set(emptyTreeRoot);
    //Used to make sure that we are storing states
    this.storageNumber.set(Field.zero);
  }
  //
  //TODO:  Verify Merke Tree before inserting a commitment
  @method updateMerkleTree(commitment: Field) {
    console.log('Updating the Merkle Tree .....');

    /**
     * Getting Merkle Tree State in the contract
     */
    let merkleTreeRoot = this.merkleTreeRoot.get();
    this.merkleTreeRoot.assertEquals(merkleTreeRoot);
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
    console.log('=>>>>>>SEEEE EVENT EMITED');
    console.log(deposit);

    // this.emitNullifierEvent(Field(1))
  }
  @method updateOffchain(
    leafIsEmpty: Bool,
    oldLeaf: Field,
    commitment: Field,
    path: MerkleWitness8,
    storedNewRootNumber: Field,
    storedNewRootSignature: Signature
  ) {
    //Get the state of the contract
    const storedRoot = this.storageTreeRoot.get();
    this.storageTreeRoot.assertEquals(storedRoot);
    console.log('INITAL STATE OF THE ROOT OFF-CHAIN', storedRoot.toString());
    let storedNumber = this.storageNumber.get();
    this.storageNumber.assertEquals(storedNumber);

    let storageServerPublicKey = this.storageServerPublicKey.get();
    this.storageServerPublicKey.assertEquals(storageServerPublicKey);
    console.log('STORAGE SERVER PB => ', storageServerPublicKey);

    //Check that the new leaf is greated than the old leaf
    let leaf = [oldLeaf];
    let newLeaf = [commitment];

    const updates = [
      {
        leaf,
        leafIsEmpty,
        newLeaf,
        newLeafIsEmpty: Bool(false),
        leafWitness: path,
      },
    ];
    //Fucntion to verify that the update really came from the existing

    const storedNewRoot = OffChainStorage.assertRootUpdateValid(
      storageServerPublicKey,
      storedNumber,
      storedRoot,
      updates,
      storedNewRootNumber,
      storedNewRootSignature
    );

    this.storageTreeRoot.set(storedNewRoot);
    this.storageNumber.set(storedNewRootNumber);
  }
  /**
   * Verification Method for Merkle Tree
   */
  @method verifyMerkleProof(commitment: Field, merkleProof: MerkleWitness8) {
    let witnessMerkleRoot = merkleProof.calculateRoot(commitment);
    console.log('PROOF VERIFICATION ROOT => ', witnessMerkleRoot.toString());
    //TODO: SHOULD COMO OFF-CHAIN
    let stateMerkleTreeRoot = this.merkleTreeRoot.get();
    this.merkleTreeRoot.assertEquals(stateMerkleTreeRoot);

    witnessMerkleRoot.assertEquals(stateMerkleTreeRoot);
  }
  @method emitNullifierEvent(nullifierHash: Field) {
    let nullifierEvent = {
      nullifier: nullifierHash,
      timeStamp: Field(1),
    };
    //TODO: BUG HERE
    this.emitEvent('nullifier', nullifierEvent);
    console.log('Nullifier Event emmited', nullifierEvent);
  }
  @method async verifyNullifier(nullifier: Field) {
    console.log('VERIFICATION OF NULLIFIER STARTED');
    // let rawEvents = await this.fetchEvents();
    // let nullifierEvents =  rawEvents.filter((a) => (a.type = `nullifier`));
    // console.log('COMING NULLIFIER EVENTS')
    // let normalizedNullifierEvents =normalizeNullifier(nullifierEvents);
    // console.log('Normalized events => ',normalizedNullifierEvents)
    // console.log('Normalized events => ', rawEvents);
    //Search for an event with a given commitment
    // let eventWithNullifier = normalizedNullifierEvents.find(
    // (e) => e.nullifier.toString() === nullifier.toString()
    // );
    // console.log('ARE THERE EVENTS? ->',eventWithNullifier)
  }
}

// setup
const Local = Mina.LocalBlockchain();
Mina.setActiveInstance(Local);
//   const storageServerAddress = 'http://localhost:3001';
// const serverPublicKey = await OffChainStorage.getPublicKey(
//   storageServerAddress,
//   NodeXMLHttpRequest
// );
// a test account that pays all the fees, and puts additional funds into the zkapp
//For our Mixer case the minadoFeePayer will be the HarpoAccount
let minadoFeePayer = Local.testAccounts[0].privateKey;
let minadoFeePayerAccount = minadoFeePayer.toPublicKey();

// ZK APP ACCOUNT
let zkappKey = PrivateKey.random();
let zkappAddress = zkappKey.toPublicKey();
let zkapp = new MixerZkApp(zkappAddress);

console.log('HERE');
let tx = await Mina.transaction(minadoFeePayer, () => {
  AccountUpdate.fundNewAccount(minadoFeePayer);
  zkapp.deploy({ zkappKey: zkappKey });
  zkapp.initState();
  zkapp.sign(zkappKey);
  console.log('Minado wallet funded succesfully');
});
await tx.send();
//   }
//todo: Off-chain storage
// async function offChainStorageSetup() {
// Connecting to the server
// }
// async function updateMerkleTreeOffchain(commitment: Field) {
//   //Get the root of the Merkle Tree
//   // get the existing tree
//   /**
//    * TODO: CHANGE FOR REAL LAST INDEX WHEN REFACTOR IS COMPLETED
//    */
//   //  let index =zkapp.lastIndexAdded.get()
//   //  zkapp.lastIndexAdded.assertEquals(index);
//   const index = BigInt(Math.floor(Math.random() * 4));
//   console.log('UPDATE MERKLE OFF-CHAIN FUNCTION STARTS ');
//   const treeRoot = await zkapp.storageTreeRoot.get();
//   const idx2fields = await OffChainStorage.get(
//     storageServerAddress,
//     zkappAddress,
//     MerkleTreeHeight,
//     treeRoot,
//     NodeXMLHttpRequest
//   );
//   // RECONSTRUCTING THE TREE
//   const tree = OffChainStorage.mapToTree(MerkleTreeHeight, idx2fields);
//   //Crearing the merkle witness
//   //TODO: Turn leaf index into a BigInt
//   const leafWitness = new MerkleWitness8(tree.getWitness(index));

//   // get the previopus commitment
//   const priorCommitmentInLeaf = !idx2fields.has(index);
//   let priorCommitment: Field;
//   //TODO:CHECK THIS LOGIC
//   if (!priorCommitmentInLeaf) {
//     priorCommitment = idx2fields.get(index)![0];
//     //Change for new commitment
//   } else {
//     priorCommitment = Field.zero;
//   }
//   // update the leaf, and save it in the storage server
//   idx2fields.set(index, [commitment]);
//   const [storedNewStorageNumber, storedNewStorageSignature] =
//     await OffChainStorage.requestStore(
//       storageServerAddress,
//       zkappAddress,
//       MerkleTreeHeight,
//       idx2fields,
//       NodeXMLHttpRequest
//     );
//   console.log('storedNewStorageNumber =>>.', storedNewStorageNumber);
//   console.log(
//     'changing index',
//     index,
//     'from',
//     priorCommitment.toString(),
//     'to',
//     commitment.toString()
//   );
//   console.log('LEAF NUMBER =>>', commitment.toString());
//   //update the smart contract
//   let transaction = await Mina.transaction(minadoFeePayer, () => {
//     zkapp.updateOffchain(
//       Bool(priorCommitmentInLeaf),
//       priorCommitment,
//       commitment,
//       leafWitness,
//       storedNewStorageNumber,
//       storedNewStorageSignature
//     );
//     zkapp.sign(zkappKey);
//   });
//   await transaction.send();

//   let postIntertionRoot = zkapp.storageTreeRoot.get();
//   zkapp.storageTreeRoot.assertEquals(postIntertionRoot);
//   console.log(
//     'OFF-CHAIN ROOT POST IMPLEMENTATION',
//     postIntertionRoot.toString()
//   );
// }
async function returnAddresses() {
  let object = {
    user: userAccountAddress,
    zkapp: zkappAddress,
    feePayer: minadoFeePayerAccount,
  };
  return object;
}
//   'Initial state of the merkle tree =>>',
//   zkapp.merkleTreeRoot.get().toString()
// );

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
  //TODO: DELETE
  // await emitNullifierEvent(Field(1));
  await updateMerkleTree(commitment);
  await sendFundstoMixer(userAccountKey, amount);
  const note = {
    currency: 'Mina',
    amount: new UInt64(amount),
    nullifier: nullifier,
    secret: secret,
  };

  const noteString = generateNoteString(note);
  let finalBalanceUser = getAccountBalance(userAccountAddress).toString();
  let finalBalanceZkApp = getAccountBalance(zkappAddress).toString();
  let finalBalanceFeePayer = getAccountBalance(
    minadoFeePayerAccount
  ).toString();
  console.log(`INTIAL BALANCE USER ACCOUNT:${finalBalanceUser} MINA`);
  console.log(`INTIAL BALANCE ZkApp:${finalBalanceZkApp} MINA`);
  console.log(`INTIAL BALANCE FeePayer:${finalBalanceFeePayer} MINA`);
  // await emitNullifierEvent(Field(1))
  return noteString;
}
//TODO: Change type
function normalizeDepositEvents(depositEvent: any) {
  let newEvents = [];
  for (let i = 0; i < depositEvent.length; i++) {
    let element = depositEvent[i].event;
    //**BUG HERE */
    let eventsNormalized = element.toFields(null);
    //TODO:CHeck if we want this as string
    let object = {
      commitment: eventsNormalized[0],
      leafIndex: eventsNormalized[1]?.toString(),
      timeStamp: eventsNormalized[2]?.toString(),
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
async function emitNullifierEvent(nullifierHash: Field) {
  let tx3 = await Mina.transaction(minadoFeePayer, () => {
    zkapp.emitNullifierEvent(nullifierHash);
    zkapp.sign(zkappKey);
  });
  await tx3.send();
}

function getAccountBalance(address: any) {
  return Mina.getBalance(address);
}

function getAccountBalanceString(address: any) {
  return Mina.getBalance(address).toString();
}

/**
 * Function to create Nullifier Nullifier: H ( Spending Key, rho )
 * Spending key: Public key
 * Rho: Private key
 */

async function createNullifier(publicKey: PublicKey) {
  let keyString = publicKey.toFields();
  let secret = Field.random();
  if (secret.toString().trim().length !== 77) {
    secret = Field.random();
  }
  //TODO: DELETE
  console.log('SECREETTTTTT => ', secret.toString());
  //TODO: Sometimes this has is a lenght sometimes is another one
  let nullifierHash = Poseidon.hash([...keyString, secret]);
  console.log('NULLFIERHASH', nullifierHash.toString());
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
  commitment: Field;
};

type Note = {
  currency: string;
  amount: UInt64;
  nullifier: Field;
  secret: Field;
};
function createDeposit(nullifier: Field, secret: Field): Deposit {
  let deposit = {
    nullifier,
    secret,
    commitment: createCommitment(nullifier, secret),
  };

  return deposit;
}

function generateNoteString(note: Note): string {
  return `Minado&${note.currency}&${note.amount}&${note.nullifier}%${note.secret}&Minado`;
}

function parseNoteString(noteString: string): Note {
  const noteRegex =
    /Minado&(?<currency>\w+)&(?<amount>[\d.]+)&(?<nullifier>[0-9a-fA-F]+)%(?<secret>[0-9a-fA-F]+)&Minado/g;
  const match = noteRegex.exec(noteString);

  if (!match) {
    throw new Error('The note has invalid format');
  }

  return {
    currency: match.groups?.currency!,
    amount: new UInt64(Number(match.groups?.amount)),
    nullifier: new Field(match.groups?.nullifier!),
    secret: new Field(match.groups?.secret!),
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
  try {
    /**Note is parsed */
    let parsedNote = parseNoteString(noteString);
    console.log('NOTE PARSEDD WITHDRAW=>', parsedNote);
    let deposit = createDeposit(parsedNote.nullifier, parsedNote.secret);
    /**Verofy the Merkle Path */
    await validateProof(deposit);
    let ammount = parsedNote.amount.value;
    console.log('TYPE OF AMOUNT', typeof parsedNote.amount);
    console.log('AMOOUNT VALUE IN OBJECT', ammount);
    console.log('AMOOUNT VALUE IN OBJECT', typeof ammount);
    // zkapp.emitNullifierEvent(Field(1))
    // let getEventsNullifier = await zkapp.fetchEvents()
    // console.log('TESTING EVENTS IN WITHDRAW', getEventsNullifier)
    /**Verify Nullifier */
    // let nullifier = Field(1);
    // zkapp.verifyNullifier(nullifier);
    /**Withdraw funds and emit nullifier event */
    console.log(
      '+++++++++USER ADDRESS STRING => ',
      userAccountAddress.toJSON()
    );
    console.log(userAccountAddress.toJSON());
    console.log(
      '+++++++++USER ADDRESS constant => ',
      userAccountAddress.toConstant()
    );
    console.log(JSON.stringify(userAccountAddress.toJSON()));
    await withdrawFunds(userAccountAddress, ammount);
  } catch (e) {
    console.error(e);
    return 'error';
  }
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
  console.log('RUNNING MERKLE PATH VALIDATION');
  let depositEvents = await getDepositEvents();
  //TODO: LEAVE AS FIELD IF NECCESARY
  // console.log('deposit after note => ')
  let commitmentDeposit = deposit.commitment;
  //TODO PUT AMMOUNT INTO A VARIABLE
  console.log('DEPOSIT EVENTS WITHDRAW => ', depositEvents);
  console.log('COMMITMENT COMING', commitmentDeposit.toString());
  console.log('COMMITMENT IN EVENT FIELD', depositEvents[0].commitment);
  console.log(
    'COMMITMENT IN EVENT STRING',
    depositEvents[0].commitment.toString()
  );
  console.log(
    'IS THE COMMITMENT THE SAME?',
    depositEvents[0].commitment == commitmentDeposit
  );
  //Search for an event with a given commitment
  let eventWithCommitment = depositEvents.find(
    (e) => e.commitment.toString() === commitmentDeposit.toString()
  );
  console.log('NORMALIZED EVENT COMING WITHDRAW', eventWithCommitment);
  //TODO: Change this
  let leafIndex = eventWithCommitment?.leafIndex;
  console.log(
    'LEAF INDEXXX coming from event GOING TO PROOF',
    BigInt(leafIndex)
  );
  //TODO: Add validations of the event

  let merkleTreeWitness = merkleTree.getWitness(BigInt(leafIndex));
  let merkleWitness = new MerkleWitness8(merkleTreeWitness);
  console.log('Merkle Proof => ', merkleWitness);

  try {
    zkapp.verifyMerkleProof(eventWithCommitment?.commitment, merkleWitness);
    console.log('VERIFICATION COMPLETED, RELEASING FUNDS');
  } catch (e) {
    console.log('Proof not valid');
    console.log(e);
  }
  //TODO: ADD basic catch erros returns to link it with the front-end
  return true;
  //Verifying the nullifier
}
async function getDepositEvents() {
  let rawEvents = await zkapp.fetchEvents();
  let despositEvents = (await rawEvents).filter((a) => (a.type = `deposit`));
  console.log('DEPOSIT EVENTS GOING TO NORMALIZE', despositEvents);
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
async function withdrawFunds(reciever: PublicKey, amount: any) {
  let tx = await Mina.transaction(zkappKey, () => {
    let update = AccountUpdate.createSigned(zkappKey);
    //The userAddress is funced
    update.send({ to: reciever, amount: amount });
    console.log(`Sendind Funds to address ${reciever}`);
    //Parece que la zkapp no puede recibir fondos
  });
  await tx.send();
  console.log(
    'BALANCE ZKAPP ACCOUNT => ',
    getAccountBalanceString(zkappAddress)
  );
  // console.log('DEPOSIT IN WITHDRAW  =>>> ', deposit);
}

initTest();
