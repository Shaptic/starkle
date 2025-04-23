import "./styles/style.css";
import "./styles/dice.css";

import $ from "jquery";
import { Buffer as BufferPolyfill } from "buffer/";

import { authorizeEntry, Keypair, xdr } from "@stellar/stellar-sdk";
import { Server } from "@stellar/stellar-sdk/rpc";
import Freighter from "@stellar/freighter-api";

// https://github.com/3d-dice/dice-box-threejs
import DiceBox from "@3d-dice/dice-box-threejs";

import { makeClient } from "./contracts/helpers";
import { SERVER_URL, ONE_XLM, PASSPHRASE } from "./contracts/constants";

// Listen for the "roll" event from the server.
import { BustEvent, HoldEvent, RollEvent, WinEvent } from "./contracts/events";
import { Eventing } from "./eventing";
import { getAccountBalance, getGameBalance, sleep } from "./helpers";
import { dice2words, roll, scoreDice, yeeter } from "./game";
import { socket } from "./socket";
import {
  showPopup,
  showTopPopup,
  modalCancellable,
  modalFailure,
  modalSuccess,
  modalSpin,
} from "./popups";

(globalThis as any).Buffer = (window as any).Buffer = BufferPolyfill;

import { IWallet, makeKeypairWallet } from "./iwallet";

export async function run() {
  let user: IWallet;
  let uname: string;
  let userPk: Keypair;
  let opponent: string;

  function logout() {
    window.localStorage.clear();
    window.location.href = "/";
  }

  async function login() {
    switch (window.localStorage.getItem("walletMethod")) {
      case "import":
        let [username, secretKey] = ["username", "secretKey"].map((k) =>
          window.localStorage.getItem(k),
        );
        uname = username!;
        userPk = Keypair.fromSecret(secretKey!);
        user = makeKeypairWallet(userPk);

        console.debug(
          `Logged in ${uname} as ${(await user.getAddress()).address}`,
        );
        break;

      case "generate":
        const s = new Server(SERVER_URL);

        userPk = Keypair.random();
        modalSpin(`Generating account w/ play money...`);
        try {
          await s.requestAirdrop(userPk.publicKey());
        } catch (e: any) {
          alert(`Generating account failed: ${e.message}`);
          logout();
        }
        modalSuccess(
          `Account ${userPk.publicKey().substring(0, 6)}... funded!`,
        );

        // Save it so we don't refund on a refresh.
        window.localStorage.setItem("secretKey", userPk.secret());
        window.localStorage.setItem("walletMethod", "import");

        uname = window.localStorage.getItem("username")!;
        user = makeKeypairWallet(userPk);
        break;

      case "freighter":
        const { isConnected } = await Freighter.isConnected();
        if (!isConnected) {
          logout();
        }

        const { address, error } = await Freighter.requestAccess();
        if (!address) {
          alert(`Failed to connect to Freighter: ${error}`);
          logout();
        }

        const { network, networkPassphrase } = await Freighter.getNetwork();
        if (networkPassphrase != PASSPHRASE) {
          console.error(network, networkPassphrase);
          alert(
            "Account is on the wrong network! Please switch to a testnet account.",
          );
          logout();
        }

        // @ts-ignore
        user = Freighter;
        uname = window.localStorage.getItem("username")!;
        userPk = Keypair.fromPublicKey(await getAddress());
        break;

      default:
        alert("Invalid login! Redirecting to login page...");
        logout();
    }
  }

  if (!window.localStorage.getItem("signedUp")) {
    logout();
  }
  await login();

  const eventer = new Eventing();
  const contract = await makeClient(user!);
  const diceBox = new DiceBox(".game-area", {
    theme_surface: "taverntable",
    theme_texture: "wood",
    theme_material: "wood",
    sounds: true,
    sound_dieMaterial: "wood",
    strength: 2.5,
    light_intensity: 1,
    gravity_multiplier: 600,
    baseScale: 100,
  });

  async function main() {
    $("#username").text(uname!);
    $("#account-id")
      .text(`${userPk.publicKey().substring(0, 8)}...`)
      .attr("title", `${userPk.publicKey()} (click to copy)`)
      .on("click", () => {
        navigator.clipboard.writeText(userPk.publicKey());
      });

    getBalances();
    diceBox.initialize();
    contract.wager().then((txn) => {
      $("#wager").text((txn.result / ONE_XLM).toString());
    });

    $(".deposit").on("click", onDepositBtn);
    $(".withdraw").on("click", onWithdrawBtn);
    $(".refresh").on("click", () => getBalances());

    // When the play button is clicked, show the modal popup
    $("#play").on("click", onPlayBtn);
    $("#logout").on("click", () => logout());

    // In-game action buttons
    $("#holdReroll").on("click", () => onDiceTurnBtn(false));
    $("#holdPass").on("click", () => onDiceTurnBtn(true));

    socket.onAny((e, ...args) => console.debug(e, ...args));

    socket.on("auth_request", handleAuth);
    socket.on("match_start", handleMatchStart);
    socket.on("match_error", handleMatchError);

    eventer.on("roll", onRoll);
    eventer.on("reroll", onReRoll);
    eventer.on("bust", onBust);
    eventer.on("win", onWin);
  }

  async function handleAuth(event: { match_id: string; entry: string }) {
    $("#wait-status").text("Authorizing game...");

    let lastLedger: number = 0;

    const { network, networkPassphrase } = await user.getNetwork();
    switch (network) {
      case "TESTNET":
        const rpc = new Server(SERVER_URL);
        const ll = await rpc.getLatestLedger();

        lastLedger = ll.sequence + Math.floor(60 / 5);
        break;

      default:
        throw `Wrong network: ${network}.`;
    }

    const entry = xdr.SorobanAuthorizationEntry.fromXDR(event.entry, "base64");
    console.log(entry.toXDR("base64"));

    return authorizeEntry(
      entry,
      async (payload: xdr.HashIdPreimage) => {
        console.debug("Signing payload:", payload.toXDR("base64"));

        // @ts-ignore
        const { signedAuthEntry, signerAddress, error } =
          await user.signAuthEntry(payload.toXDR("base64"), {
            address: userPk.publicKey(),
            networkPassphrase: PASSPHRASE,
          });
        if (!signedAuthEntry || error) {
          throw error;
        }

        // Massage wallet API into an SDK's SigningCallback
        let signature: BufferPolyfill =
          typeof signedAuthEntry === "string"
            ? // BUG: stellar-base expects an array rather than a base64 string
              BufferPolyfill.from(signedAuthEntry, "base64")
            : signedAuthEntry;

        return {
          signature,
          publicKey: userPk.publicKey(),
        };
      },
      lastLedger,
      networkPassphrase,
    ).then(
      (signedAuthEntry) => {
        socket.emit("auth_response", {
          match_id: event.match_id,
          player: userPk.publicKey(),
          entry: signedAuthEntry.toXDR("base64"),
        });
      },
      (reason) => {
        modalFailure(
          `Authorization failed: ${reason?.message ?? JSON.stringify(reason)}`,
        );
      },
    );
  }

  async function handleMatchError(event: any) {
    modalFailure(event.error ?? JSON.stringify(event), () => {
      $("#play").show();
      socket.disconnect();
      socket.connect();
    });
  }

  async function handleMatchStart(event: {
    match_id: string;
    first_player: string;
    users: string[];
  }) {
    getBalances();

    $("#wait-status").text("Joined!");
    $("#waitingModal").hide();
    $("#play").hide();
    $(".scoreboard").show();
    $(".chat-panel").show();

    const [playerA, playerB] = (event.match_id as string).split("|");
    const them = event.users.filter((x) => x !== uname)[0];
    const pk = userPk.publicKey();

    opponent = playerA === pk ? playerB : playerA;
    eventer.listen([playerA, playerB]);

    $("#name").text(uname).attr("title", pk);
    $("#opponent-name").text(them).attr("title", opponent);

    if (event.first_player !== pk) {
      return;
    }

    try {
      const rollResult = await safeRoll(
        user,
        opponent,
        "Building first roll transaction...",
      );
      await diceBox.roll(renderRoll(rollResult));
    } catch (err: any) {
      modalFailure(err.toString(), () => {
        handleMatchStart(event);
      });
    }
  }

  async function onPlayBtn() {
    if (socket.disconnected) {
      modalFailure("Not connected to server :( Try refreshing?");
    } else {
      socket.emit(
        "join",
        {
          address: userPk.publicKey(),
          username: uname,
        },
        (msg: any) => {
          console.log("Ack:", msg);
          modalSpin("Waiting for opponent...");
        },
      );
    }

    modalCancellable(() => {
      socket.disconnect(); // re-connect to cancel our place in the queue
      socket.connect();
    });
  }

  async function onDepositBtn() {
    modalSpin("Depositing 20 XLM...");
    console.debug("Depositing 20 XLM into the contract...");

    return yeeter(
      await contract
        .deposit({
          to: userPk.publicKey(),
          amount: 20n * ONE_XLM,
        })
        .then((txn) => {
          $("#wait-status").text(
            "Authorizing & sending deposit transaction...",
          );
          return txn;
        }),
    ).then(
      () => {
        modalSuccess("Funds deposited.");
        getBalances();
      },
      (err: any) => {
        modalFailure(`Authorization failed! Reason: ${err.message}`);
      },
    );
  }

  async function onWithdrawBtn() {
    modalSpin("Withdrawing funds...");
    console.debug("Withdrawing all XLM from the contract...");

    return yeeter(
      await contract
        .withdraw({
          from: userPk.publicKey(),
        })
        .then((txn) => {
          $("#wait-status").text(
            "Authorizing & sending withdrawal transaction...",
          );
          return txn;
        }),
    ).then(
      () => {
        modalSuccess("Funds withdrawn.");
        getBalances();
      },
      (err: any) => {
        modalFailure(`Authorization failed! Reason: ${err.message}`);
      },
    );
  }

  // Invoke rolling with error-handling.
  function safeRoll(
    w: IWallet,
    opponent: string,
    message?: string,
    save?: number[],
    stop?: boolean,
  ): Promise<number[]> {
    modalSpin(message ?? "Building roll transaction...");
    console.debug(
      `Rolling against ${opponent}, saving ${save} and stop: ${stop}`,
    );

    return roll(w, opponent, save, stop).then(
      (result) => {
        $("#waitingModal").hide();
        return result;
      },
      (err: any) => {
        modalFailure(`Authorization failed! Reason: ${err.message}`);
        return Promise.reject(err);
      },
    );
  }

  async function onDiceTurnBtn(stop: boolean) {
    $("#dicePanel").hide();

    // The actual values
    const dice: number[] = $(".die.active")
      .map(function () {
        return parseInt($(this).data("value"));
      })
      .toArray();
    // and their respective indices
    const sel: number[] = $(".die.active")
      .map(function () {
        return parseInt($(this).data("index"));
      })
      .toArray();

    const score = scoreDice(dice);
    console.log(`Roll ${dice} scored ${score}.`);
    if (score === 0) {
      modalFailure(
        `Invalid dice hold! You must only keep scoring dice.`,
        () => {
          renderDiceChoice(
            $(".die")
              .map(function () {
                return parseInt($(this).data("value"));
              })
              .toArray(),
          );
        },
      );
      return;
    }

    let msg: string = `Building roll transaction to save ${dice2words(dice)} for ${score} points `;

    if (!stop) {
      let rollCount = $(".die").length - sel.length;
      if (rollCount <= 0) {
        rollCount = 6;
      }
      const rollExpr = rollCount === 1 ? "die" : "dice";

      msg += `and re-roll ${rollCount} ${rollExpr}...`;
    } else {
      msg += `and pass...`;
    }

    try {
      const rollResult = await safeRoll(user, opponent, msg, sel, stop);
      if (rollResult.length > 0) {
        diceBox.roll(renderRoll(rollResult));
      }
    } catch (err: any) {
      console.error(`Caught error, letting player re-choose: ${err}`);
      renderDiceChoice(
        $(".die")
          .map(function () {
            return parseInt($(this).text());
          })
          .toArray(),
      );
    }
  }

  async function onRoll(event: Event) {
    // Expecting data.dice to be an array with <= 6 dice values.
    const data = (event as CustomEvent).detail as RollEvent;

    if (data.dice.length === 0) {
      const pronoun = data.player === userPk.publicKey() ? "their" : "your";
      showPopup(`It's ${pronoun} turn!`);

      // If it's now our turn, kick off the roll state machine.
      if (pronoun === "your") {
        try {
          const rollResult = await safeRoll(user, opponent);
          await diceBox.roll(renderRoll(rollResult));
        } catch (err: any) {
          renderDiceChoice(data.dice);
        }
      } // otherwise do nothing
      return;
    }

    if (data.player === userPk.publicKey()) {
      await sleep(3000);
      renderDiceChoice(data.dice);
    } else {
      // Renders faster when it's our roll, so only fake it when it's theirs.
      await diceBox.roll(renderRoll(data.dice));
    }
  }

  async function onReRoll(event: Event) {
    const data = (event as CustomEvent).detail as HoldEvent;

    if (data.player !== userPk.publicKey() && data.dice.length > 0) {
      const name = $("#opponent-name").text();
      const dice = dice2words(data.dice);
      const end = data.stop ? " and passed to you" : "";

      showTopPopup(`${name} kept ${dice} for ${data.score} points${end}.`);
    }

    // Perform local score calculation:
    //
    // If they held, accumulate into their turn score.
    // If they passed, accumulate their turn score to their total and reset
    // the turn score.
    let prefix = data.player !== userPk.publicKey() ? "opponent-" : "";
    let e = $(`#${prefix}turn-score`);
    const turnScore = parseInt(e.text());
    e.text(turnScore + data.score);

    if (data.stop) {
      const score = $(`#${prefix}total-score`);
      score.text(parseInt(score.text()) + turnScore + data.score);
      e.text("0");

      // Kick off a call to a real score lookup, just in case.
      contract
        .score({ player: data.player })
        .then((txn) => txn.simulate())
        .then((txn) => {
          score.text(txn.result.toString());
        });
    }
  }

  async function onBust(event: Event) {
    const data = (event as CustomEvent).detail as BustEvent;

    const weBust = data.player === userPk.publicKey();
    if (!weBust) {
      // otherwise we rendered in onRoll
      await diceBox.roll(renderRoll(data.dice));
    }

    const player = weBust ? "You" : "Opponent";
    showTopPopup(`${player} busted with ${dice2words(data.dice)}!`);
    let prefix = !weBust ? "opponent-" : "";
    $(`#${prefix}turn-score`).text("0");

    // If they busted, it's our roll now.
    if (!weBust) {
      await sleep(3000);

      // Don't render the roll here, because this call results in a roll event
      // which will trigger rendering.
      safeRoll(user, opponent, "Building a fresh roll transaction...");
    }
  }

  async function onWin(event: Event) {
    const data = (event as CustomEvent).detail as WinEvent;
    diceBox.clearDice();

    const onClose = () => {
      getBalances();
      $(".scoreboard").fadeOut();
      $(".chat-panel").fadeOut();
      $("#play").show();
    };

    if (data.player === userPk.publicKey()) {
      modalSuccess(
        `You won with ${data.score} points! Winnings have been transferred to your account.`,
        onClose,
      );
    } else {
      modalFailure(
        `You lost :( Your opponent finished with ${data.score} points.`,
        onClose,
      );
    }
  }

  function renderRoll(roll: number[]): string {
    const s = `${roll.length}d6@${roll.map((v) => v.toString()).join(",")}`;
    console.info("Rolling", s);
    return s;
  }

  function renderDiceChoice(dice: number[]) {
    // Clear previous dice (if any)
    const diceContainer = $(".dice-container").html("");

    // Create a die element for each value.
    dice.forEach((value, index) => {
      const dieEl = $("<div>");
      dieEl
        .addClass(["die", `p${value}`])
        .data("value", value)
        .data("index", index)
        .on("click", () => dieEl.toggleClass("active"))
        // Add pips to match the die
        .append(new Array(value).fill(0).map(() => $("<div>").addClass("pip")));
      diceContainer.append(dieEl);
    });

    // Show the dice panel (at bottom-center).
    $("#dicePanel").show();
  }

  async function getAddress(): Promise<string> {
    const { address } = await user.getAddress();
    return address;
  }

  async function getBalances() {
    console.log(
      `Refreshing balances for ${userPk.publicKey().substring(0, 6)}...`,
    );
    let { element, oldBalance, newBalance } = await getAccountBalance(user);
    renderBalanceUpdate(element, oldBalance, newBalance);

    ({ element, oldBalance, newBalance } = await getGameBalance(user));
    renderBalanceUpdate(element, oldBalance, newBalance);
  }

  function renderBalanceUpdate(
    e: JQuery<HTMLElement>,
    oldB: string,
    newB: string,
  ) {
    const delta = parseFloat(newB) - parseFloat(oldB);
    if (Math.round(delta) === 0) {
      return;
    }

    const span = $("<span>").addClass("balance-change");
    span
      .addClass(delta > 0 ? "win" : "loss")
      .text(`${delta > 0 ? "+" : ""}${delta.toFixed(2)}`);

    e.parent().append(span);
    setTimeout(() => span.remove(), 2500);
  }

  main();
}
