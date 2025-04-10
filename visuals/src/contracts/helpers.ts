import { Client as Farkle } from "./farkle";
import { CONTRACT_ID, SERVER_URL } from "./constants";
import { IWallet } from "../iwallet";

export async function makeClient(w: IWallet): Promise<Farkle> {
  const { address } = await w.getAddress();
  const { networkPassphrase } = await w.getNetwork();

  return new Farkle({
    contractId: CONTRACT_ID,
    publicKey: address,
    rpcUrl: SERVER_URL,
    networkPassphrase,
    signTransaction: w.signTransaction,
    signAuthEntry: w.signAuthEntry,
  });
}
