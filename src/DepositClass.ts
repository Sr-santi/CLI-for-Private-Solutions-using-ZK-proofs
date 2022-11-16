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
export default class RollupDeposit extends CircuitValue {
  @prop nullifier: PublicKey;
  @prop secret: UInt64;
  @prop commitment: Field;
  @prop signature: Signature;
  @prop leafIndex: Field;
  @prop merkleProof: MerkleTree;
}
