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
export default class NullifierClass extends CircuitValue {
  @prop nullifier: Field;
  @prop timeStamp: Field;

  constructor(nullifier: Field, timeStamp: Field) {
    super(nullifier, timeStamp);
    this.nullifier = nullifier;
    this.timeStamp = timeStamp;
  }
  toFieldsCommitment(): Field[] {
    return this.nullifier.toFields();
  }
}
