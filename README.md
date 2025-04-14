# Sfarkle: Farkle on the Stellar Network

Farkle is a dice game played between two players where you try to rack up points by creating combinations of dice during your rolls.

## Rules + Scoring

Rules can depend on the variation you're playing, but the rules in this variant are based directly on the rules in [_Kingdom Come Deliverance 2_](https://www.ign.com/wikis/kingdom-come-deliverance-2/How_to_Play_Dice). To make a long story short:

* 1s are worth 100
* 5s are worth 50
* 1 through 5 is worth 500
* 2 through 6 is worth 750
* 1 through 6 is worth 1500
* Triples are worth 100 times the dice amount (three 3s = 300, etc.) except for for ones which are special and worth 1000.
* More than triple will double the score for each additional die (four 1s = 2000, five 2s = 200 * 2 * 2 = 800).

**That's it!** You can see the detailed scoring algorithm in the contract's [`score_turn` function](contract/contracts/farkle/src/lib.rs).

## Playing the game

### Contract-only play
You _could_ play the game using only the contract. It's less fun, but it's doable. The [test file](contract/contracts/farkle/src/test.rs) demonstrates this.

First, both players need to deposit funds into the contract for wagering: call `deposit(address)` to do this. Then, you can play the game. The steps go like this:

1. Call `engage(addressA, addressB)` to begin a match between two players. The method will return who should go first. Suppose it's `addressA`.
2. Call `roll(addressA, [], false)` to perform your first roll. The method will return your randomly-generated dice roll.
3. Then, call `roll(addressA, [dice-to-save], true|false)`, where `[dice-to-save]` is the list of _indices_ of the dice you want to save from your previous roll (so if you got `[1 1 1 2 3 4]` from the previous roll, you might pass `[0 1 2]`), and the `true|false` controls whether you want to pass play to your opponent or keep rolling the remaining dice, respectively.
4. If you bust on your roll, the turn passes to the next player immediately and `roll` will return an empty list.
5. Then, the other player repeats from Step 2.
6. Play continues until one player reaches >= 2000 points!

### UI play
Naturally, this makes play hard to keep track of and match-making next to impossible. It's much more fun to have a UI.

First, someone needs to run+host the matchmaking server:

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python main.py
```

Once this is running, players can join a matchmaking queue. Run the UI:

```bash
cd visuals
npm i
npm run dev
```

and open two browser windows. You'll need either two separate browsers or private browsing mode because we use local session storage to keep track of a player's keys. Then, deposit funds into the contract and click "Join Game" to enter the queue. Play will proceed once both players have joined and authorized invoking the `engage` method!