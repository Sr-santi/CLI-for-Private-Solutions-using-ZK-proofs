import {
  CircuitValue,
  Field,
  Poseidon,
  prop,
  PublicKey,
  Signature,
  UInt64,
} from 'snarkyjs';
import { MerkleTree } from 'snarkyjs/dist/node/lib/merkle_tree';
export default class DepositClass extends CircuitValue {
  @prop commitment: Field;
  @prop leafIndex: Field;
  @prop timeStamp: Field;

  constructor(commitment: Field, leafIndex: Field, timeStamp: Field) {
    super(commitment, leafIndex, timeStamp);
    this.commitment = commitment;
    this.leafIndex = leafIndex;
    this.timeStamp = timeStamp;
  }
}
