#![no_std]
use soroban_sdk::{contract, contracterror, contractimpl, contracttype, log};
use soroban_sdk::{panic_with_error, token};
use soroban_sdk::{vec, Address, BytesN, Env, IntoVal, Map, Vec};

#[contract]
pub struct Farkle;

#[derive(Clone)]
#[contracttype]
pub enum UserData {
    // persistent
    Balance(Address), // i128 value

    // temporary
    Score(Address),     // u32 value
    TurnScore(Address), // u32 value, the temporary score for the turn
    Dice(Address),      // Vec<u32> value (last dice roll)
    Match(Address),     // Address value, indicating their opponent
    Turn(Address),      // Address value, indicating who can roll

    // temporary, for tracking forfeits
    LastPlayed(Address), // u32 ledger number
}

#[derive(Clone)]
#[contracttype]
pub enum AdminData {
    Token,
    Admin,
}

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    InvalidAmount = 0,
    NotInitialized = 1,
    AlreadyPlaying = 2,
    TooPoor = 3,
    NotYourTurn = 4,
    WrongMatch = 5,
    BadDieHold = 6,
}

const ONE_XLM: i128 = 10_000_000;
const COST_TO_PLAY: i128 = 3 * ONE_XLM; // ~$1
const FORFEIT_DURATION: u32 = 180; // ledger count @ ~5s/ea = 15m

#[contractimpl]
impl Farkle {
    /**
     * Initializes the game.
     *
     * # Arguments
     *
     * - `admin` - The owner of this instance of the game.
     */
    pub fn __constructor(env: Env, admin: Address) {
        // Wagers are done purely in XLM; sadly this has to be hardcoded.
        let xlm = Address::from_str(
            &env,
            "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC",
        );

        env.storage().instance().set(&AdminData::Token, &xlm); // so we don't re-derive
        env.storage().instance().set(&AdminData::Admin, &admin);
    }

    /** Returns the current version of the game. */
    pub fn version() -> u32 {
        1
    }

    /** Returns the current wager / cost to play the game. */
    pub fn wager() -> i128 {
        COST_TO_PLAY
    }

    /** Allows the admin to upgrade the contract to a new Wasm blob. */
    pub fn upgrade(e: Env, new_wasm_hash: BytesN<32>) {
        let admin: Address = e.storage().instance().get(&AdminData::Admin).unwrap();
        admin.require_auth();

        e.deployer().update_current_contract_wasm(new_wasm_hash);
    }

    /** Returns the current balance a player holds in the game for wagering. */
    pub fn balance(env: &Env, player: Address) -> i128 {
        Self::check_init(&env);
        let user = UserData::Balance(player);

        env.storage().persistent().get(&user).unwrap_or(-1)
    }

    /**
     * Deposits the token into the contract for wagering.
     *
     * # Arguments
     *
     * `to` - The address from which to take `amount` and transfer to the contract.
     * `amount` - The quantity of the token to transfer.
     *
     * # Returns
     *
     * The current balance of the account after this deposit.
     */
    pub fn deposit(env: Env, by: Address, amount: i128) -> i128 {
        if amount <= 0 {
            return 0;
        }

        Self::check_init(&env);
        by.require_auth();

        let store = env.storage().persistent();
        let user = UserData::Balance(by.clone());
        let mut balance: i128 = store.get(&user).unwrap_or(0);

        // Transfer into the contract for holding.
        let t: Address = Self::token(&env);
        let contract = env.current_contract_address();
        let client = token::Client::new(&env, &t);
        client.transfer(&by, &contract, &amount);

        balance += amount;
        store.set(&user, &balance);

        balance
    }

    /**
     * Withdraws funds for an account.
     *
     * # Arguments
     *
     * - `from` - The account for which to perform a withdrawal
     *
     * # Returns
     *
     * The amount withdrawn, for reference.
     */
    pub fn withdraw(env: Env, from: Address) -> i128 {
        let t: Address = Self::token(&env);
        let balance = Self::balance(&env, from.clone());
        if balance > 0 {
            from.require_auth();

            // Transfer to the account.
            let contract = env.current_contract_address();
            let client = token::Client::new(&env, &t);
            client.transfer(&contract, &from, &balance);

            // Doing this in the if block avoids an RPC bug that prevents us
            // from removing keys that don't exist.
            env.storage().persistent().remove(&UserData::Balance(from));
        }

        balance
    }

    /** Returns the current score for a player, assuming they're in a match. */
    pub fn score(env: Env, player: Address) -> u32 {
        env.storage()
            .temporary()
            .get(&UserData::Score(player))
            .unwrap_or(0)
    }

    /**
     * Begins a match between two players.
     *
     * If both players authorize beginning a match, this will set the game up
     * by holding the wager amount in the contract as an escrow mechanism. It
     * then randomly decides on who should go first, returning that address.
     *
     * It will also emit an event corresponding to the initialization of the
     * match, with the topics ["match", "Player A", "Player B"] and the data
     * field being the address that goes first. This should allow players to
     * observe the beginning of the match without necessarily being the ones
     * to submit the invocation.
     *
     * # Arguments
     *
     * `a` - The player on one side of the match
     * `b` - The player on the other side of the match
     *
     * # Returns
     *
     * The address of the player who should go (call `roll`) first.
     *
     * # Panics
     *
     * - If either player is already in a game.
     * - If a player doesn't have a sufficient amount deposited to wager a game
     *   (see `COST_TO_PLAY`, 1k XLM).
     */
    pub fn engage(env: Env, a: Address, b: Address) -> Address {
        Self::check_init(&env);
        let store = env.storage().temporary();

        // Is A already engaged in a game?
        let a_opp: Option<Address> = store.get(&UserData::Match(a.clone()));
        if a_opp.is_some() {
            panic_with_error!(&env, Error::AlreadyPlaying);
        }

        // Is B already engaged in a game?
        let b_opp: Option<Address> = store.get(&UserData::Match(b.clone()));
        if b_opp.is_some() {
            panic_with_error!(&env, Error::AlreadyPlaying);
        }

        // Only now require authorization from both parties.
        a.require_auth();
        b.require_auth();

        // Lower both players balances so they can't withdraw what they're
        // currently betting in the game.
        Self::hold_balance(&env, &a);
        Self::hold_balance(&env, &b);

        // Mark players as being in a match against each other.
        store.set(&UserData::Match(a.clone()), &b);
        store.set(&UserData::Match(b.clone()), &a);

        // Overwrite any previous dice rolls, in case of bugs.
        let empty: Vec<u32> = Vec::new(&env);
        store.set(&UserData::Dice(a.clone()), &empty);
        store.set(&UserData::Dice(b.clone()), &empty);

        let seq = env.ledger().sequence();
        store.set(&UserData::LastPlayed(a.clone()), &seq);
        store.set(&UserData::LastPlayed(b.clone()), &seq);

        // Roll for who goes first.
        let first: u64 = env.prng().gen_range(1..=2);
        if first == 1 {
            store.set(&UserData::Turn(a.clone()), &a);
            store.set(&UserData::Turn(b.clone()), &a);
        } else {
            store.set(&UserData::Turn(a.clone()), &b);
            store.set(&UserData::Turn(b.clone()), &b);
        }

        Self::emit_match(&env, &a, &b, first == 1)
    }

    pub fn forfeit(env: Env, opponent: Address) -> bool {
        let store = env.storage().temporary();

        // Who's the opponent playing against?
        let player = Self::get_opp(&env, opponent.clone());

        // When's the last time the opponent took an action?
        let last_seq: u32 = store.get(&UserData::LastPlayed(opponent.clone())).unwrap();

        // Is it currently their turn?
        let playing: Address = store.get(&UserData::Turn(opponent.clone())).unwrap();
        if playing != opponent {
            // If it's not the opponent's turn, they aren't stalling.
            return false;
        }

        if env.ledger().sequence() - FORFEIT_DURATION < last_seq {
            // Opponent still has time to make a move.
            return false;
        }

        Self::_end_match(&env, opponent, player.clone());
        let t = Self::token(&env);
        let payout = Self::get_payout();
        let client = token::Client::new(&env, &t);
        let contract = env.current_contract_address();
        client.transfer(&contract, &player, &payout);

        Self::emit_win(&env, &player, 0);

        true
    }

    /**
     * Performs a single roll in the game of Farkle.
     *
     * In Farkle, games are played with rounds. In each round, you perform multiple
     * rolls, either setting aside dice to accumulate to your turn's score and
     * rolling again, or setting aside + passing to lock in your turn's score and
     * add it to your accumulated total score.
     *
     * First to 2000 wins!
     *
     * # Arguments
     *
     * `player` - The person who is rolling the dice.
     * `save` - A list of indices into the dice to keep from the previous roll.
     *
     *      In other words, if the previous `roll` call returned a 4-dice roll
     *      with `[1, 6, 2, 1]` (because you've already set the other two aside),
     *      and you wanted to keep both 1s, the `save` list should be [0, 3]
     *      because you want to keep the 1st and 4th dice (0-based indexing).
     * `stop` - Whether or not you want to stop after this accumulation of points.
     *
     * # Returns
     *
     * A list representing the latest dice roll.
     * If this list is empty, you passed `save` and this turn won you the match.
     *
     * Keep in mind that if your roll results in an immediate bust, the turn will
     * pass to the next player. However, this isn't immediately obvious from the
     * return value: you have to perform the same score calculation and see that
     * it occurred, or watch for the "bust" event.
     *
     * # Panics
     *
     * - If the contract isn't properly initialized.
     * - If this `player` isn't in a match.
     * - If it isn't this `player`s turn at the moment.
     * - If this is a player's first roll for a turn and the `save` list isn't empty.
     * - If the player tries `save`ing more dice than they have available.
     * - If the player tries `save`ing dice that don't exist.
     * - If the dice you `save` don't actually score.
     */
    pub fn roll(env: Env, player: Address, save: Vec<u32>, stop: bool) -> Vec<u32> {
        Self::check_init(&env);
        let store = env.storage().temporary();

        // Is this player even in a match?
        let opp: Address = Self::get_opp(&env, player.clone());

        // Is it their turn?
        let _: Address = match store.get(&UserData::Turn(player.clone())) {
            Some(turn) => {
                if turn != player {
                    panic_with_error!(&env, Error::NotYourTurn)
                }
                turn
            }
            None => panic_with_error!(&env, Error::WrongMatch),
        };

        player.require_auth();
        Self::bump_match_ttl(&env, player.clone(), opp.clone());

        // What was their roll last turn?
        let last_roll: Vec<u32> = match store.get(&UserData::Dice(player.clone())) {
            Some(dice) => dice,
            None => Vec::new(&env),
        };

        log!(&env, "Last roll by", player, last_roll);
        let mut roll: Vec<u32> = Vec::new(&env);
        let mut roll_count: u32;

        // Was there a previous roll?
        if last_roll.len() > 0 {
            let mut turn_score: u32 = store.get(&UserData::TurnScore(player.clone())).unwrap_or(0);

            //
            // The player can either pass outright, keep a dice combo and
            // pass+score, or keep a dice combo and re-roll.
            //

            if save.len() > last_roll.len() {
                panic_with_error!(&env, Error::BadDieHold)
            }
            if save.len() == 0 && !stop {
                panic_with_error!(&env, Error::BadDieHold);
            }

            let mut saved: Vec<u32> = Vec::new(&env);
            for dice_idx in save.into_iter() {
                saved.push_back(match last_roll.get(dice_idx) {
                    Some(x) => x,
                    None => panic_with_error!(&env, Error::BadDieHold),
                });
            }

            roll_count = last_roll.len() - saved.len();
            let roll_score = Self::score_turn(&env, &saved, true);
            if roll_score == 0 && !stop {
                panic_with_error!(&env, Error::BadDieHold);
            }

            Self::emit_reroll(&env, &player, &saved, roll_score, stop);

            turn_score += roll_score as u32;

            if !stop {
                store.set(&UserData::TurnScore(player.clone()), &turn_score);

                // Fresh re-roll; we're still still mid-turn.
                if roll_count == 0 {
                    roll_count = 6;
                }
            } else {
                let score = store.get(&UserData::Score(player.clone())).unwrap_or(0) + turn_score;

                // Did the player win? If so, transfer their winnings and
                // end the game.
                if score >= 2000 {
                    let t = Self::token(&env);
                    let client = token::Client::new(&env, &t);
                    let payout = Self::get_payout();

                    let contract = env.current_contract_address();
                    client.transfer(&contract, &player, &payout);

                    Self::_end_match(&env, player.clone(), opp);
                    Self::emit_win(&env, &player, score);
                } else {
                    // Update the new score.
                    store.set(&UserData::Score(player.clone()), &score);
                    Self::pass_turn(&env, player.clone(), opp);
                    Self::emit_roll(&env, player.clone(), &roll);
                }

                return roll;
            }
        } else {
            // If they didn't have a last roll, this is a brand new roll.
            roll_count = 6;
        }

        for _i in 1..=roll_count {
            let die: u64 = env.prng().gen_range(1..=6);
            roll.push_back(die as u32);
        }

        // If they bust out immediately, end the turn early.
        if Self::score_turn(&env, &roll, false) == 0 {
            Self::pass_turn(&env, player.clone(), opp);
            Self::emit_bust(&env, player.clone(), &roll);
        } else {
            // Store the last roll.
            store.set(&UserData::Dice(player.clone()), &roll);
            Self::emit_roll(&env, player.clone(), &roll);
        }

        roll
    }

    /** Returns the token address being used for wagers. */
    pub fn token(env: &Env) -> Address {
        env.storage().instance().get(&AdminData::Token).unwrap()
    }

    /** Panics if the contract isn't initialized. */
    pub fn check_init(env: &Env) {
        if !env.storage().instance().has(&AdminData::Admin) {
            panic_with_error!(env, Error::NotInitialized);
        }
        env.storage().instance().extend_ttl(
            60 * 60 * 24,         /* if < 1 day */
            60 * 60 * 24 * 7 / 5, /* ~7 days */
        );
    }

    /** Bumps the time-to-live for a match between two players. */
    pub fn bump_match_ttl(env: &Env, a: Address, b: Address) {
        let tstore = env.storage().temporary();
        let pstore = env.storage().persistent();

        tstore.set(&UserData::LastPlayed(a.clone()), &env.ledger().sequence());

        for addr in vec![&env, a, b] {
            let mut key = UserData::Score(addr.clone());
            if tstore.has(&key) {
                tstore.extend_ttl(&key, 15, 100);
            }

            key = UserData::TurnScore(addr.clone());
            if tstore.has(&key) {
                tstore.extend_ttl(&key, 15, 100);
            }

            key = UserData::Dice(addr.clone());
            if tstore.has(&key) {
                tstore.extend_ttl(&key, 15, 100);
            }

            key = UserData::Match(addr.clone());
            if tstore.has(&key) {
                tstore.extend_ttl(&key, 15, 100);
            }

            key = UserData::Turn(addr.clone());
            if tstore.has(&key) {
                tstore.extend_ttl(&key, 15, 100);
            }

            key = UserData::Balance(addr);
            if pstore.has(&key) {
                pstore.extend_ttl(
                    &key,
                    60 * 60 * 24,         /* if < 1 day */
                    60 * 60 * 24 * 7 / 5, /* ~7 days */
                );
            }
        }

        Self::check_init(env);
    }

    fn pass_turn(env: &Env, from: Address, to: Address) {
        let store = env.storage().temporary();

        // We reset instead of remove() to work around the RPC bug that fails
        // simulation when removing a non-existent key.

        // Reset their per-turn score.
        let mut key = UserData::TurnScore(from.clone());
        let zero: u32 = 0;
        store.set(&key, &zero);

        // Remove their last roll.
        key = UserData::Dice(from.clone());
        store.set(&key, &Vec::<u32>::new(&env));

        // Pass the turn.
        store.set(&UserData::Turn(from), &to);
        store.set(&UserData::Turn(to.clone()), &to);
    }

    pub fn end_match(env: &Env, player: Address, opp: Address) -> bool {
        let admin: Address = env.storage().instance().get(&AdminData::Admin).unwrap();
        admin.require_auth();

        Self::_end_match(env, player, opp)
    }

    fn _end_match(env: &Env, player: Address, opp: Address) -> bool {
        let store = env.storage().temporary();
        let mut key = UserData::Score(player.clone());
        let rv = store.has(&key);
        if rv {
            store.remove(&key);
        }
        key = UserData::Score(opp.clone());
        if store.has(&key) {
            store.remove(&key);
        }
        key = UserData::TurnScore(player.clone());
        if store.has(&key) {
            store.remove(&key);
        }
        key = UserData::TurnScore(opp.clone());
        if store.has(&key) {
            store.remove(&key);
        }
        key = UserData::Match(player.clone());
        if store.has(&key) {
            store.remove(&key);
        }
        key = UserData::Match(opp.clone());
        if store.has(&key) {
            store.remove(&key);
        }
        key = UserData::Dice(player.clone());
        if store.has(&key) {
            store.remove(&key);
        }
        key = UserData::Dice(opp.clone());
        if store.has(&key) {
            store.remove(&key);
        }
        key = UserData::LastPlayed(player);
        if store.has(&key) {
            store.remove(&key);
        }
        key = UserData::LastPlayed(opp);
        if store.has(&key) {
            store.remove(&key);
        }

        rv
    }

    fn hold_balance(env: &Env, player: &Address) {
        // Pull player balance and hold in contract
        let mut balance: i128 = Self::balance(&env, player.clone());
        if balance < COST_TO_PLAY {
            panic_with_error!(env, Error::TooPoor); // too poor to play
        }
        balance -= COST_TO_PLAY;

        // Transfer the play fee (2%) to the admin.
        let fee = COST_TO_PLAY * 2 / 100;
        let admin: Address = env.storage().instance().get(&AdminData::Admin).unwrap();
        let contract = env.current_contract_address();
        let client = token::Client::new(&env, &Self::token(&env));
        client.transfer(&contract, &admin, &fee);

        let store = env.storage().persistent();
        let user = UserData::Balance(player.clone());
        store.set(&user, &balance);
    }

    fn get_payout() -> i128 {
        COST_TO_PLAY * 2 * 2 / 100 // what both players put in, -2% fee each
    }

    fn score_turn(env: &Env, dice: &Vec<u32>, enforce: bool) -> u32 {
        // The rules of farkle are as follows:
        //
        // 1 - 100 points
        // 5 - 50 points
        //
        // All others are worth nothing on their own unless it's a triple:
        //
        // 1 1 1 - 1000 points
        // 2 2 2 - 200 points
        // 3 3 3 - 300 points
        // ... and so on.
        //
        // Each add'l matching die is doubles the base score:
        //
        // 4 4 4 4 - 800 points (400 * 2)
        // 5 5 5 5 5 - 2000 points (500 * 2 * 2)
        //
        // Series are also worth points:
        //
        // 1 2 3 4 5 - 500 points
        // 2 3 4 5 6 - 750 points
        // 1 2 3 4 5 6 - 1500 points

        // First, group the dice by number.
        let mut groups = Map::new(&env);
        for die in dice.into_iter() {
            groups.set(die, groups.get(die).unwrap_or(0) + 1);
        }

        let mut score = 0;
        let indiv: Vec<u32> = groups.keys(); // set of dice
        let best: Vec<u32> = vec![&env, 1, 2, 3, 4, 5, 6];
        let mid: Vec<u32> = vec![&env, 2, 3, 4, 5, 6];
        let low: Vec<u32> = vec![&env, 1, 2, 3, 4, 5];

        if indiv.len() == 6 {
            score = 1500;
        } else if Self::subset(&indiv, &low) {
            score += 500;

            // Remove the ones we used.
            for i in low.into_iter() {
                groups.set(i, groups.get(i).unwrap() - 1);
            }
        } else if Self::subset(&indiv, &mid) {
            score += 750;

            // Remove the ones we used.
            for i in mid.into_iter() {
                groups.set(i, groups.get(i).unwrap() - 1);
            }
        }

        // Now lets tally up groups.
        for i in best.into_iter() {
            let count = groups.get(i).unwrap_or(0);
            if count < 3 {
                // nothing to group
                continue;
            }

            let mut base = if i == 1 {
                // 1s are worth more when grouped.
                1000
            } else {
                i * 100
            };

            // Each add'l die after 3 doubles the value.
            // (This works for count == 3 because 2^0 = 1)
            let two: u32 = 2;
            base *= two.pow(count - 3);

            score += base;
            groups.set(i, 0);
        }

        // Now lets count any straggler 1s or 5s.
        score += 100 * groups.get(1).unwrap_or(0);
        score += 50 * groups.get(5).unwrap_or(0);

        groups.set(1, 0);
        groups.set(5, 0);

        // If the groups aren't completely empty, this is a bad die hold:
        // players CANNOT hold dice besides scoring ones.
        if enforce && groups.iter().any(|(_val, count)| count > 0) {
            panic_with_error!(&env, Error::BadDieHold);
        }

        score
    }

    fn get_opp(env: &Env, player: Address) -> Address {
        match env.storage().temporary().get(&UserData::Match(player)) {
            Some(x) => x,
            None => panic_with_error!(env, Error::NotYourTurn),
        }
    }

    /** Checks if `inner` is a subset of `main`. */
    fn subset(main: &Vec<u32>, inner: &Vec<u32>) -> bool {
        main.len() >= inner.len() && inner.iter().all(|x| main.contains(x))
    }

    /**
     * Emits an event ["match", playerA, playerB] with the data value being
     * whichever player goes first. Unfortunately this does mean you need to
     * either filter on both player combination topics or wildcard them, but
     * that's fine.
     *
     * Returns the address corresponding to the first player.
     */
    fn emit_match(env: &Env, a: &Address, b: &Address, a_first: bool) -> Address {
        let first_player = if a_first { a.clone() } else { b.clone() };

        env.events().publish(
            vec![&env, "match".into_val(env), a.to_val(), b.to_val()],
            first_player.clone(),
        );

        first_player
    }

    fn emit_roll(env: &Env, player: Address, roll: &Vec<u32>) {
        env.events().publish(
            vec![&env, "roll".into_val(env), player.to_val()],
            roll.clone(),
        );
    }

    fn emit_bust(env: &Env, player: Address, roll: &Vec<u32>) {
        env.events().publish(
            vec![&env, "bust".into_val(env), player.to_val()],
            roll.clone(),
        );
    }

    fn emit_reroll(env: &Env, player: &Address, dice: &Vec<u32>, score: u32, stop: bool) {
        env.events().publish(
            vec![&env, "reroll".into_val(env), player.to_val()],
            vec![&env, dice.to_val(), score.into(), stop.into_val(env)],
        );
    }

    fn emit_win(env: &Env, winner: &Address, score: u32) {
        env.events()
            .publish(vec![&env, "win".into_val(env), winner.to_val()], score);
    }
}

mod test;
