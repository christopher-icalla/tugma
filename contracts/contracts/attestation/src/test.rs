#![cfg(test)]

use super::*;
use soroban_sdk::{
    testutils::{Address as _, Ledger},
    Address, BytesN, Env, String,
};

struct Setup<'a> {
    env: Env,
    client: AttestationRegistryClient<'a>,
    admin: Address,
    compliance: Address,
    risk: Address,
    org: String,
    pkg: String,
}

fn setup<'a>() -> Setup<'a> {
    let env = Env::default();
    env.mock_all_auths();
    env.ledger().with_mut(|l| {
        l.timestamp = 1_775_000_000;
        l.sequence_number = 100;
    });

    let admin = Address::generate(&env);
    let contract_id = env.register(AttestationRegistry, (&admin,));
    let client = AttestationRegistryClient::new(&env, &contract_id);

    let org = String::from_str(&env, "org-tugma-demo-psp");
    let pkg = String::from_str(&env, "pkg-2026-01-01-2026-03-31");
    let compliance = Address::generate(&env);
    let risk = Address::generate(&env);
    client.add_signer(&org, &compliance);
    client.add_signer(&org, &risk);

    Setup { env, client, admin, compliance, risk, org, pkg }
}

fn err(e: Error) -> soroban_sdk::Error {
    e.into()
}

fn hash(env: &Env, b: u8) -> BytesN<32> {
    BytesN::from_array(env, &[b; 32])
}

fn attest(s: &Setup, signer: &Address, h: &BytesN<32>) -> u32 {
    s.client.attest(
        signer,
        &s.org,
        &s.pkg,
        &String::from_str(&s.env, "2026-01-01"),
        &String::from_str(&s.env, "2026-03-31"),
        h,
    )
}

#[test]
fn attest_and_read_back() {
    let s = setup();
    let h = hash(&s.env, 1);

    assert_eq!(attest(&s, &s.compliance, &h), 1);

    let a = s.client.get(&s.org, &s.pkg, &1);
    assert_eq!(a.hash, h);
    assert_eq!(a.attester, s.compliance);
    assert_eq!(a.attested_at, 1_775_000_000);
    assert_eq!(a.attested_ledger, 100);
    assert_eq!(a.verifier, None);
    assert_eq!(s.client.latest(&s.org, &s.pkg), a);
    assert_eq!(s.client.verify(&h), Some(a));
}

#[test]
fn reattesting_appends_versions() {
    let s = setup();
    let h1 = hash(&s.env, 1);
    let h2 = hash(&s.env, 2);

    assert_eq!(attest(&s, &s.compliance, &h1), 1);
    assert_eq!(attest(&s, &s.compliance, &h2), 2);

    assert_eq!(s.client.version_count(&s.org, &s.pkg), 2);
    assert_eq!(s.client.get(&s.org, &s.pkg, &1).hash, h1);
    assert_eq!(s.client.latest(&s.org, &s.pkg).hash, h2);
    assert_eq!(s.client.verify(&h1).unwrap().version, 1);
}

#[test]
fn unauthorized_signer_cannot_attest() {
    let s = setup();
    let outsider = Address::generate(&s.env);
    let res = s.client.try_attest(
        &outsider,
        &s.org,
        &s.pkg,
        &String::from_str(&s.env, "2026-01-01"),
        &String::from_str(&s.env, "2026-03-31"),
        &hash(&s.env, 1),
    );
    assert_eq!(res, Err(Ok(err(Error::NotAuthorizedSigner))));
}

#[test]
fn signer_is_scoped_to_org() {
    let s = setup();
    let other_org = String::from_str(&s.env, "org-other");
    let res = s.client.try_attest(
        &s.compliance,
        &other_org,
        &s.pkg,
        &String::from_str(&s.env, "2026-01-01"),
        &String::from_str(&s.env, "2026-03-31"),
        &hash(&s.env, 1),
    );
    assert_eq!(res, Err(Ok(err(Error::NotAuthorizedSigner))));
}

#[test]
fn duplicate_hash_rejected() {
    let s = setup();
    let h = hash(&s.env, 1);
    attest(&s, &s.compliance, &h);

    let res = s.client.try_attest(
        &s.compliance,
        &s.org,
        &String::from_str(&s.env, "pkg-other"),
        &String::from_str(&s.env, "2026-01-01"),
        &String::from_str(&s.env, "2026-03-31"),
        &h,
    );
    assert_eq!(res, Err(Ok(err(Error::HashAlreadyAttested))));
}

#[test]
fn countersign_by_different_signer() {
    let s = setup();
    attest(&s, &s.compliance, &hash(&s.env, 1));

    s.env.ledger().with_mut(|l| l.timestamp = 1_775_000_600);
    s.client.countersign(&s.risk, &s.org, &s.pkg, &1);

    let a = s.client.get(&s.org, &s.pkg, &1);
    assert_eq!(a.verifier, Some(s.risk.clone()));
    assert_eq!(a.verified_at, Some(1_775_000_600));
}

#[test]
fn attester_cannot_countersign_own_attestation() {
    let s = setup();
    attest(&s, &s.compliance, &hash(&s.env, 1));
    let res = s.client.try_countersign(&s.compliance, &s.org, &s.pkg, &1);
    assert_eq!(res, Err(Ok(err(Error::SelfVerification))));
}

#[test]
fn cannot_countersign_twice() {
    let s = setup();
    let third = Address::generate(&s.env);
    s.client.add_signer(&s.org, &third);
    attest(&s, &s.compliance, &hash(&s.env, 1));
    s.client.countersign(&s.risk, &s.org, &s.pkg, &1);

    let res = s.client.try_countersign(&third, &s.org, &s.pkg, &1);
    assert_eq!(res, Err(Ok(err(Error::AlreadyVerified))));
}

#[test]
fn countersign_missing_version_not_found() {
    let s = setup();
    let res = s.client.try_countersign(&s.risk, &s.org, &s.pkg, &1);
    assert_eq!(res, Err(Ok(err(Error::NotFound))));
}

#[test]
fn removed_signer_cannot_attest() {
    let s = setup();
    s.client.remove_signer(&s.org, &s.compliance);
    assert!(!s.client.is_signer(&s.org, &s.compliance));

    let res = s.client.try_attest(
        &s.compliance,
        &s.org,
        &s.pkg,
        &String::from_str(&s.env, "2026-01-01"),
        &String::from_str(&s.env, "2026-03-31"),
        &hash(&s.env, 1),
    );
    assert_eq!(res, Err(Ok(err(Error::NotAuthorizedSigner))));
}

#[test]
fn unknown_hash_verifies_to_none() {
    let s = setup();
    assert_eq!(s.client.verify(&hash(&s.env, 9)), None);
}

#[test]
fn signer_management_requires_admin_auth() {
    let s = setup();
    let new_signer = Address::generate(&s.env);
    s.client.add_signer(&s.org, &new_signer);

    let auths = s.env.auths();
    assert_eq!(auths.len(), 1);
    assert_eq!(auths[0].0, s.admin);
}

#[test]
fn attest_requires_attester_auth() {
    let s = setup();
    attest(&s, &s.compliance, &hash(&s.env, 1));

    let auths = s.env.auths();
    assert_eq!(auths.len(), 1);
    assert_eq!(auths[0].0, s.compliance);
}

#[test]
#[should_panic]
fn attest_without_auth_panics() {
    let env = Env::default();
    let admin = Address::generate(&env);
    let contract_id = env.register(AttestationRegistry, (&admin,));
    let client = AttestationRegistryClient::new(&env, &contract_id);
    let org = String::from_str(&env, "org-tugma-demo-psp");
    let signer = Address::generate(&env);

    env.mock_all_auths();
    client.add_signer(&org, &signer);
    env.set_auths(&[]);

    client.attest(
        &signer,
        &org,
        &String::from_str(&env, "pkg"),
        &String::from_str(&env, "2026-01-01"),
        &String::from_str(&env, "2026-03-31"),
        &hash(&env, 1),
    );
}
