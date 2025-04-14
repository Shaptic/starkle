import { Keypair } from "@stellar/stellar-sdk";
import { basicNodeSigner } from "@stellar/stellar-sdk/contract";
import { PASSPHRASE } from "./contracts/constants";

//
// Add a wallet interface conforming to https://stellar.org/protocol/sep-43
// so that we can use either Freighter or a local Keypair for signing.
//

export interface IWallet {
  getAddress: () => Promise<{ address: string }>;
  signTransaction: (
    xdr: string,
    opts?: {
      networkPassphrase?: string;
      address?: string;
      submit?: boolean;
      submitUrl?: string;
    },
  ) => Promise<{
    signedTxXdr: string;
    signerAddress?: string;
  }>;

  signAuthEntry: (
    authEntry: string,
    opts?: {
      networkPassphrase?: string;
      address?: string;
    },
  ) => Promise<{
    signedAuthEntry: string;
    signerAddress?: string;
  }>;

  getNetwork: () => Promise<{
    network: string;
    networkPassphrase: string;
  }>;

  isConnected: () => Promise<{ isConnected: boolean }>;
  requestAccess: () => Promise<{ address: string }>;
}

export function makeKeypairWallet(kp: Keypair): IWallet {
  const base = basicNodeSigner(kp, PASSPHRASE);

  class KeypairWallet implements IWallet {
    getAddress() {
      return Promise.resolve({ address: kp.publicKey() });
    }
    signTransaction = base.signTransaction;
    signAuthEntry = base.signAuthEntry;

    isConnected() {
      return Promise.resolve({ isConnected: true });
    }
    requestAccess() {
      return this.getAddress();
    }
    getNetwork() {
      return Promise.resolve({
        network: "TESTNET",
        networkPassphrase: PASSPHRASE,
      });
    }
    kp() {
      return kp;
    }
  }

  return new KeypairWallet();
}
