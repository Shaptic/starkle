import $ from "jquery";

import { Keypair, xdr } from "@stellar/stellar-sdk";
import { i128 } from "@stellar/stellar-sdk/contract";
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
  const balance = r.entries[0]!.val.account().balance().toBigInt() / ONE_XLM;

  console.debug(
    `Loaded account info for ${pk.publicKey().substring(0, 6)}: ${balance} XLM.`,
  );

  const elem = $("#account-balance");
  const oldBalance = parseFloat(elem.text()).toFixed(2);
  const newBalance = parseFloat(balance.toString()).toFixed(2);
  elem.text(parseFloat(newBalance).toFixed(2));

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
  const b = txn.result / ONE_XLM;

  const elem = $("#in-game-balance");
  const oldBalance = parseFloat(elem.text()).toFixed(2);
  const newBalance = parseFloat(b.toString()).toFixed(2);
  elem.text(parseFloat(newBalance).toFixed(2));

  return { element: elem, oldBalance, newBalance };
}

export function sleep(ms: number = 3000) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
