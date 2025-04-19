import $ from "jquery";

import { Keypair, xdr } from "@stellar/stellar-sdk";
import { Server } from "@stellar/stellar-sdk/rpc";

import { makeClient } from "./contracts/helpers";
import { ONE_XLM, SERVER_URL } from "./contracts/constants";
import { IWallet } from "./iwallet";

export async function getAccountBalance(w: IWallet): Promise<{
  element: JQuery<HTMLElement>;
  oldBalance: string;
  newBalance: string;
}> {
  const { address } = await w.getAddress();
  const pk = Keypair.fromPublicKey(address);

  const rpc = new Server(SERVER_URL);
  const r = await rpc.getLedgerEntries(
    xdr.LedgerKey.account(
      new xdr.LedgerKeyAccount({
        accountId: pk.xdrAccountId(),
      }),
    ),
  );

  let balance: number | bigint = r.entries[0]!.val.account()
    .balance()
    .toBigInt();
  if (balance <= Number.MAX_SAFE_INTEGER) {
    // better renders, iff it fits
    balance = Number(balance) / Number(ONE_XLM);
  } else {
    // better precision
    balance /= ONE_XLM;
  }

  console.debug(
    `Loaded account info for ${pk.publicKey().substring(0, 6)}: ${balance} XLM.`,
  );

  const elem = $("#account-balance");
  const oldBalance = elem.text();
  const newBalance = balance.toString();
  elem.text(Number(balance).toFixed(2));

  return { element: elem, oldBalance, newBalance };
}

export async function getGameBalance(w: IWallet): Promise<{
  element: JQuery<HTMLElement>;
  oldBalance: string;
  newBalance: string;
}> {
  const contract = await makeClient(w);
  const { address } = await w.getAddress();

  const txn = await contract.balance({ player: address });
  let b: number | bigint;
  if (txn.result === -1n) {
    b = 0;
  } else if (txn.result <= Number.MAX_SAFE_INTEGER) {
    b = Number(txn.result) / Number(ONE_XLM);
  } else {
    b = txn.result / ONE_XLM;
  }

  const elem = $("#in-game-balance");
  const oldBalance = elem.text();
  const newBalance = b.toString();
  elem.text(parseFloat(newBalance).toFixed(2));

  return { element: elem, oldBalance, newBalance };
}

export function sleep(ms: number = 3000) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
