# TUGMA — Compliance You Can Prove

**Continuous Payment Control Intelligence for regulated payment operators.**

TUGMA continuously tests actual payment operations against defined regulatory and organizational controls, identifies exceptions, connects them to remediation and evidence, and produces verifiable evidence packages.

> **Detect. Prevent. Prove.**

---

## The Problem

Regulated payment operators have policies, regulatory requirements, operational controls, transaction data, approvals, reconciliations, and evidence scattered across different systems and workflows.

The difficult question is not only:

> "Do we have a compliance policy?"

It is:

> **"Did the actual payment operation follow the required control, and can we prove what happened?"**

TUGMA connects the requirement to the actual payment activity and creates a traceable evidence chain.

---

## How TUGMA Works

```text
REGULATION
    ↓
REQUIREMENT
    ↓
CONTROL
    ↓
PAYMENT ACTIVITY
    ↓
AUTOMATED CONTROL TEST
    ↓
EXCEPTION
    ↓
REMEDIATION
    ↓
EVIDENCE
    ↓
INDEPENDENT VERIFICATION
    ↓
EVIDENCE PACKAGE
    ↓
SHA-256 INTEGRITY PROOF
    ↓
STELLAR ATTESTATION
```

---

## Stellar Attestation Contract

The final step of the chain, anchoring an evidence package's SHA-256 hash on Stellar, is handled by a Soroban smart contract in [`contracts/`](contracts/).

- **Attest:** an authorized signer anchors a package's `canonical_hash`. Re-attesting the same package appends a new version and never overwrites the old one.
- **Countersign:** a *different* authorized signer independently verifies the attestation (segregation of duties, enforced on-chain).
- **Verify:** anyone can look up a hash and see the organization, package, version, signers, and ledger it was recorded on.

**Testnet deployment**

| | |
|---|---|
| Contract ID | `CC734HZAIWGKKFFD5CZNY73EC3YJJZYDK6IJQQLCZUOSD34U3SY33ZTH` |
| Network | Stellar Testnet |
| Explorer | [View on Stellar Lab](https://lab.stellar.org/r/testnet/contract/CC734HZAIWGKKFFD5CZNY73EC3YJJZYDK6IJQQLCZUOSD34U3SY33ZTH) |

See [`contracts/README.md`](contracts/README.md) for the full function reference, build/test instructions, and example CLI calls.
