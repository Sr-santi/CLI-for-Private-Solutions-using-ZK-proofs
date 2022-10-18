# Minado🔒: Zk Privacy Solution on Mina Protocol

# What did we build? 👷🏻‍♀️🚀

We build a Mixer Protocol in Mina, the high-level idea is to allow private transactions for Mina, which we believe is necessary for building a fully private and secure ecosystem.

# Why a Mixer? 🤔

As ZkBuilders we believe that the future should not be one where you lose control over your data. Also, we build this protocol recognizing that security and privacy should not be hard for the end-user.
We envision a world where people can control their data in a smooth and low-effort way.

# How does it work?👇🏻🧑🏻‍💻

The protocol is divided into 3 parts:

## -Deposit logic:

In the deposit, the following actions are executed.

1. A Minado account that will pay the gas fees is funded

2. A userAccount is funded to deposit into our minadoZkAppAccount..

- Note: In a real implementation this would not happen as the account already has a balance

3. A commitment needs to be created C(0) = H(S(0),N(0))

   Note: S= Secret , N= Nullifier ( N(0) = Hash(PB(user),Random private key ))

   3.1 A Secret is created using Poseidon ( Cryptography library in Snarky )

   3.2 A Nullifier is created to avoid double spending

   3.3 The Secret and the Nullifier are hashed and the commitment is created.

4. The commitment is added to the Leaf of the Merkle Tree.

5. A note which we can understand as a Zk-proof of the commitment is provided to the user to store it.

6. Funds are sent from the user account to the minadoZkAppAccount

## -State management ( Merkle Tree) :The steps we followed are:

1. Create a Merkle Tree instance.

2. Wrap the Merkle Tree into an off-chain storage form

3. Set leaf with the Commitment Ex: C(0)

4. Get the root of the tree ” Initial commitment” Which would be used to
   verify the transaction ”

## -Validation and Withdraw (Circuit)

1. The user provides the note.

2. With the note a Merkle tree Witness is generated based on the commitment index ( Which comes from the commitment provided)

3. With help of the witness the commitment is verified, without revealing it. The witness allows us to “reconstruct” the Merkle path getting to the root and validating that the commitment is part of the Merkle path

# The future of our project 🔮🚀

We think this project is fundamental for creating a privacy and security ecosystem, also we are sure it could create more impact after this Hackathon.
#The future steps that we will execute for this project are:

- Integrate compatibility with Wallets: We want to focus first on delivering a secure, friendly, and high-quality product. We will integrate compatibility with Aura Wallet and then Chainsafe or Uniswap when the integration is ready, the goal is to increase adoption.

- Upgrade from a Mixer to a Private Rollup: We want to build a privacy rollup that enables more builders to create ZkApps on top of our protocol, for example, Defi private protocols, including lending applications, staking applications, and an infinite number of possibilities.

- Building bridges between Minado and other blockchains: We will start building bridges with other blockchains to increase volume and liquidity which will benefit other builders like us and will enhance network effects.

## How to build? 💡

Our project is divided into 2 parts our Smart contract and our UI. You can find them in the following links:

UI: https://github.com/Sr-santi/mina-ui
Smart Contract: https://github.com/Sr-santi/mina-eth-bogota-contract

# For running the smart contract you need to: 🏃

## Clone the Repo

```sh
-cd Mina-smart-contract
-Run npm run build
-Run npm start to see the current implementation of our mixer.
```

# For running the UI you need to: 🏃

-Clone the Repo
-cd mina-u
-Run yarn
-Run yarn dev.
-Open http://localhost:3000/

# Improvements 🔧

-Validate merkle tree before inserting the commitment into it (Set merkle tree before adding a new leaf)

-Another withdraw proof needs to be approved to send the funds out.

-Marking sure you are setting a transition of the Merkle Tree.

-Calculate the roots of the Merkle Tree.

-We are not depositing into the contract.

-Using proof of authorization ( With balance )

-Create nullifier Tree and verify if the commitment is inside this Tree before withdrawing. ( To avoid double spending )

-Start exploting the rollup process.

```

## License

[Apache-2.0](LICENSE)
```
