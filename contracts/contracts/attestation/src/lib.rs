//! TUGMA evidence-package attestation registry.
//!
//! Anchors the SHA-256 `canonical_hash` of a TUGMA evidence package on Stellar.
//!
//! - An admin authorizes signer addresses per organization.
//! - An authorized signer `attest`s a package hash. Re-attesting the same package
//!   appends a new version; earlier versions are never overwritten.
//! - A *different* authorized signer `countersign`s a version (segregation of duties).
//! - Anyone can `verify` a hash to find the package, version, signers and ledger.
#![no_std]
use soroban_sdk::{
    contract, contracterror, contractevent, contractimpl, contracttype, panic_with_error, Address,
    BytesN, Env, String,
};

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    NotAuthorizedSigner = 1,
    HashAlreadyAttested = 2,
    NotFound = 3,
    AlreadyVerified = 4,
    SelfVerification = 5,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Attestation {
    pub org: String,
    pub package_id: String,
    pub version: u32,
    pub hash: BytesN<32>,
    pub period_start: String,
    pub period_end: String,
    pub attester: Address,
    pub attested_at: u64,
    pub attested_ledger: u32,
    pub verifier: Option<Address>,
    pub verified_at: Option<u64>,
}

#[contracttype]
#[derive(Clone)]
enum DataKey {
    Admin,
    Signer(String, Address),
    VersionCount(String, String),
    Record(String, String, u32),
    ByHash(BytesN<32>),
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Attested {
    #[topic]
    pub org: String,
    #[topic]
    pub package_id: String,
    pub version: u32,
    pub hash: BytesN<32>,
    pub attester: Address,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Countersigned {
    #[topic]
    pub org: String,
    #[topic]
    pub package_id: String,
    pub version: u32,
    pub verifier: Address,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct SignerChanged {
    #[topic]
    pub org: String,
    pub signer: Address,
    pub authorized: bool,
}

const DAY_IN_LEDGERS: u32 = 17_280;

fn bump<K: soroban_sdk::IntoVal<Env, soroban_sdk::Val>>(env: &Env, key: &K) {
    let max = env.storage().max_ttl();
    env.storage()
        .persistent()
        .extend_ttl(key, max - DAY_IN_LEDGERS, max);
}

fn bump_instance(env: &Env) {
    let max = env.storage().max_ttl();
    env.storage()
        .instance()
        .extend_ttl(max - DAY_IN_LEDGERS, max);
}

fn admin(env: &Env) -> Address {
    env.storage().instance().get(&DataKey::Admin).unwrap()
}

fn require_signer(env: &Env, org: &String, signer: &Address) {
    let key = DataKey::Signer(org.clone(), signer.clone());
    if !env.storage().persistent().get(&key).unwrap_or(false) {
        panic_with_error!(env, Error::NotAuthorizedSigner);
    }
    bump(env, &key);
}

fn load(env: &Env, org: &String, package_id: &String, version: u32) -> Attestation {
    let key = DataKey::Record(org.clone(), package_id.clone(), version);
    match env.storage().persistent().get(&key) {
        Some(a) => {
            bump(env, &key);
            a
        }
        None => panic_with_error!(env, Error::NotFound),
    }
}

#[contract]
pub struct AttestationRegistry;

#[contractimpl]
impl AttestationRegistry {
    pub fn __constructor(env: Env, admin: Address) {
        env.storage().instance().set(&DataKey::Admin, &admin);
        bump_instance(&env);
    }

    // ------------------------------------------------------------- admin

    pub fn admin(env: Env) -> Address {
        admin(&env)
    }

    pub fn set_admin(env: Env, new_admin: Address) {
        admin(&env).require_auth();
        env.storage().instance().set(&DataKey::Admin, &new_admin);
        bump_instance(&env);
    }

    pub fn add_signer(env: Env, org: String, signer: Address) {
        admin(&env).require_auth();
        let key = DataKey::Signer(org.clone(), signer.clone());
        env.storage().persistent().set(&key, &true);
        bump(&env, &key);
        bump_instance(&env);
        SignerChanged { org, signer, authorized: true }.publish(&env);
    }

    pub fn remove_signer(env: Env, org: String, signer: Address) {
        admin(&env).require_auth();
        env.storage()
            .persistent()
            .remove(&DataKey::Signer(org.clone(), signer.clone()));
        SignerChanged { org, signer, authorized: false }.publish(&env);
    }

    pub fn is_signer(env: Env, org: String, signer: Address) -> bool {
        env.storage()
            .persistent()
            .get(&DataKey::Signer(org, signer))
            .unwrap_or(false)
    }

    // ------------------------------------------------------ attestation

    /// Anchors `hash` as a new version of `package_id`. Returns the version (starting at 1).
    pub fn attest(
        env: Env,
        attester: Address,
        org: String,
        package_id: String,
        period_start: String,
        period_end: String,
        hash: BytesN<32>,
    ) -> u32 {
        attester.require_auth();
        require_signer(&env, &org, &attester);

        let hash_key = DataKey::ByHash(hash.clone());
        if env.storage().persistent().has(&hash_key) {
            panic_with_error!(&env, Error::HashAlreadyAttested);
        }

        let count_key = DataKey::VersionCount(org.clone(), package_id.clone());
        let version: u32 = env.storage().persistent().get(&count_key).unwrap_or(0) + 1;

        let record = Attestation {
            org: org.clone(),
            package_id: package_id.clone(),
            version,
            hash: hash.clone(),
            period_start,
            period_end,
            attester: attester.clone(),
            attested_at: env.ledger().timestamp(),
            attested_ledger: env.ledger().sequence(),
            verifier: None,
            verified_at: None,
        };
        let record_key = DataKey::Record(org.clone(), package_id.clone(), version);

        env.storage().persistent().set(&record_key, &record);
        env.storage().persistent().set(&count_key, &version);
        env.storage()
            .persistent()
            .set(&hash_key, &(org.clone(), package_id.clone(), version));
        bump(&env, &record_key);
        bump(&env, &count_key);
        bump(&env, &hash_key);
        bump_instance(&env);

        Attested { org, package_id, version, hash, attester }.publish(&env);
        version
    }

    /// Independent verification of an attested version by a different authorized signer.
    pub fn countersign(env: Env, verifier: Address, org: String, package_id: String, version: u32) {
        verifier.require_auth();
        require_signer(&env, &org, &verifier);

        let mut record = load(&env, &org, &package_id, version);
        if record.verifier.is_some() {
            panic_with_error!(&env, Error::AlreadyVerified);
        }
        if record.attester == verifier {
            panic_with_error!(&env, Error::SelfVerification);
        }

        record.verifier = Some(verifier.clone());
        record.verified_at = Some(env.ledger().timestamp());
        env.storage()
            .persistent()
            .set(&DataKey::Record(org.clone(), package_id.clone(), version), &record);

        Countersigned { org, package_id, version, verifier }.publish(&env);
    }

    // ------------------------------------------------------------ reads

    pub fn get(env: Env, org: String, package_id: String, version: u32) -> Attestation {
        load(&env, &org, &package_id, version)
    }

    pub fn latest(env: Env, org: String, package_id: String) -> Attestation {
        let version: u32 = env
            .storage()
            .persistent()
            .get(&DataKey::VersionCount(org.clone(), package_id.clone()))
            .unwrap_or_else(|| panic_with_error!(&env, Error::NotFound));
        load(&env, &org, &package_id, version)
    }

    pub fn version_count(env: Env, org: String, package_id: String) -> u32 {
        env.storage()
            .persistent()
            .get(&DataKey::VersionCount(org, package_id))
            .unwrap_or(0)
    }

    /// Looks up an evidence-package hash. `None` means it was never attested.
    pub fn verify(env: Env, hash: BytesN<32>) -> Option<Attestation> {
        let found: Option<(String, String, u32)> =
            env.storage().persistent().get(&DataKey::ByHash(hash));
        found.map(|(org, package_id, version)| load(&env, &org, &package_id, version))
    }
}

mod test;
