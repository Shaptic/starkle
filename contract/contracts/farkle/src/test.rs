#![cfg(test)]
extern crate std;

use super::*;
use soroban_sdk::testutils::Address as _;
use soroban_sdk::{Address, Env};

const INIT: i128 = 2000 * ONE_XLM;

#[test]
fn test() {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let sac = env.register_stellar_asset_contract_v2(admin.clone());

    let sac_admin = token::StellarAssetClient::new(&env, &sac.address());
    let sac_client = token::Client::new(&env, &sac.address());

    let client = FarkleClient::new(&env, &env.register(Farkle, (&admin, &sac.address())));
    let alice = Address::generate(&env);
    let bob = Address::generate(&env);

    sac_admin.mint(&alice, &INIT);
    sac_admin.mint(&bob, &INIT);

    let balance: i128 = 1000 * ONE_XLM;
    assert_eq!(client.deposit(&alice, &balance), balance);
    assert_eq!(client.deposit(&alice, &balance), balance * 2);
    assert_eq!(client.deposit(&bob, &balance), balance);

    // Ensure getters work
    assert_eq!(client.balance(&alice), balance * 2);
    assert_eq!(client.balance(&bob), balance);

    // Alice is first because it's deterministic in tests.
    let first = client.engage(&alice, &bob);
    assert_eq!(first, alice);
    assert_eq!(client.balance(&alice), balance * 2 - COST_TO_PLAY);

    let mut rv = roll(&client, &alice, vec![&env], false);
    assert_eq!(rv.len(), 6); // 6 1 6 2 4 5

    rv = roll(&client, &alice, vec![&env, 1, 5], false);
    assert_eq!(rv.len(), 4); // 1 1 5 5

    rv = roll(&client, &alice, vec![&env, 0, 1, 2, 3], false);
    assert_eq!(rv.len(), 6); // 5 4 5 5 6 4

    rv = roll(&client, &alice, vec![&env, 0, 2, 3], false);
    assert_eq!(rv.len(), 3); // 6 6 5

    rv = roll(&client, &alice, vec![&env, 2], false);
    assert_eq!(rv.len(), 2); // 3 1

    rv = roll(&client, &alice, vec![&env, 1], true);
    assert_eq!(rv.len(), 0);
    assert_eq!(client.score(&alice), 1100);

    rv = roll(&client, &bob, vec![&env], false);
    assert_eq!(rv.len(), 6); // 3 1 5 3 4 3

    rv = roll(&client, &bob, vec![&env, 0, 1, 2, 3, 5], true);
    assert_eq!(rv.len(), 0);
    assert_eq!(client.score(&bob), 450);

    rv = roll(&client, &alice, vec![&env], false);
    assert_eq!(rv.len(), 6); // 6 5 5 5 2 6

    rv = roll(&client, &alice, vec![&env, 1, 2, 3], false);
    assert_eq!(rv.len(), 3); // 1 3 2

    rv = roll(&client, &alice, vec![&env, 0], true);
    assert_eq!(client.score(&alice), 1100 + 600);
    assert_eq!(rv.len(), 0);

    rv = roll(&client, &bob, vec![&env], true);
    assert_eq!(rv.len(), 6);

    rv = roll(&client, &bob, vec![&env, 2, 3, 4], true);
    assert_eq!(client.score(&bob), 450 + 600);
    assert_eq!(rv.len(), 0);

    rv = roll(&client, &alice, vec![&env], false);
    assert_eq!(rv.len(), 6);

    rv = roll(&client, &alice, vec![&env, 0, 3, 4, 5], true);
    assert_eq!(client.score(&alice), 0);
    assert_eq!(client.score(&bob), 0);
    assert_eq!(rv.len(), 0);

    assert_eq!(
        sac_client.balance(&alice),
        // Alice has 0 in account, plus winnings
        2 * COST_TO_PLAY - (ONE_XLM * 10)
    );

    assert_eq!(client.balance(&alice), 1000 * ONE_XLM);
    assert_eq!(client.withdraw(&alice), 1000 * ONE_XLM); // alice still has $ for a game
    assert_eq!(client.withdraw(&bob), 0); // bob lost so 0

    assert_eq!(client.deposit(&alice, &INIT), INIT);
    assert_eq!(client.shutdown(), INIT + (10 * ONE_XLM));

    assert_eq!(sac_client.balance(&admin), INIT + (10 * ONE_XLM));
}

fn roll(client: &FarkleClient, player: &Address, roll: Vec<u32>, stop: bool) -> Vec<u32> {
    let rv = client.roll(player, &roll, &stop);
    std::println!("Resulting roll: {rv:?}");
    return rv;
}
