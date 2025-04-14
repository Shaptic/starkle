import { Buffer } from "buffer";
import { Address } from "@stellar/stellar-sdk";
import {
  AssembledTransaction,
  Client as ContractClient,
  ClientOptions as ContractClientOptions,
  MethodOptions,
  Result,
  Spec as ContractSpec,
} from "@stellar/stellar-sdk/contract";
import type {
  u32,
  i32,
  u64,
  i64,
  u128,
  i128,
  u256,
  i256,
  Option,
  Typepoint,
  Duration,
} from "@stellar/stellar-sdk/contract";
export * from "@stellar/stellar-sdk";
export * as contract from "@stellar/stellar-sdk/contract";
export * as rpc from "@stellar/stellar-sdk/rpc";

if (typeof window !== "undefined") {
  //@ts-ignore Buffer exists
  window.Buffer = window.Buffer || Buffer;
}

export const networks = {
  testnet: {
    networkPassphrase: "Test SDF Network ; September 2015",
    contractId: "CCXJBV3TWE4UNAF3GGOZVW7CTNAP6SCKQXSYFTO5NP2BG2UD3VSC4IGC",
  },
} as const;

export type UserData =
  | { tag: "Token"; values: void }
  | { tag: "Balance"; values: readonly [string] }
  | { tag: "Score"; values: readonly [string] }
  | { tag: "TurnScore"; values: readonly [string] }
  | { tag: "Dice"; values: readonly [string] }
  | { tag: "Match"; values: readonly [string] }
  | { tag: "Turn"; values: readonly [string] };

export type AdminData =
  | { tag: "Token"; values: void }
  | { tag: "Admin"; values: void };

export const Errors = {
  0: { message: "InvalidAmount" },

  1: { message: "NotInitialized" },

  2: { message: "AlreadyPlaying" },

  3: { message: "TooPoor" },

  4: { message: "NotYourTurn" },

  5: { message: "WrongMatch" },

  6: { message: "BadDieHold" },
};

export interface Client {
  /**
   * Construct and simulate a version transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Returns the current version of the game.
   */
  version: (options?: {
    /**
     * The fee to pay for the transaction. Default: BASE_FEE
     */
    fee?: number;

    /**
     * The maximum amount of time to wait for the transaction to complete. Default: DEFAULT_TIMEOUT
     */
    timeoutInSeconds?: number;

    /**
     * Whether to automatically simulate the transaction when constructing the AssembledTransaction. Default: true
     */
    simulate?: boolean;
  }) => Promise<AssembledTransaction<u32>>;

  /**
   * Construct and simulate a wager transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Returns the current wager / cost to play the game.
   */
  wager: (options?: {
    /**
     * The fee to pay for the transaction. Default: BASE_FEE
     */
    fee?: number;

    /**
     * The maximum amount of time to wait for the transaction to complete. Default: DEFAULT_TIMEOUT
     */
    timeoutInSeconds?: number;

    /**
     * Whether to automatically simulate the transaction when constructing the AssembledTransaction. Default: true
     */
    simulate?: boolean;
  }) => Promise<AssembledTransaction<i128>>;

  /**
   * Construct and simulate a upgrade transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Allows the admin to upgrade the contract to a new Wasm blob.
   */
  upgrade: (
    { new_wasm_hash }: { new_wasm_hash: Buffer },
    options?: {
      /**
       * The fee to pay for the transaction. Default: BASE_FEE
       */
      fee?: number;

      /**
       * The maximum amount of time to wait for the transaction to complete. Default: DEFAULT_TIMEOUT
       */
      timeoutInSeconds?: number;

      /**
       * Whether to automatically simulate the transaction when constructing the AssembledTransaction. Default: true
       */
      simulate?: boolean;
    },
  ) => Promise<AssembledTransaction<null>>;

  /**
   * Construct and simulate a shutdown transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * * Offers a pseudo-shutdown mechanism that de-initializes everything.
   *      *
   *      * We say "pseudo" because the contract continues to exist, but none of the
   *      * methods will work besides `withdraw`, allowing players to pull out
   *      * their current holdings.
   */
  shutdown: (options?: {
    /**
     * The fee to pay for the transaction. Default: BASE_FEE
     */
    fee?: number;

    /**
     * The maximum amount of time to wait for the transaction to complete. Default: DEFAULT_TIMEOUT
     */
    timeoutInSeconds?: number;

    /**
     * Whether to automatically simulate the transaction when constructing the AssembledTransaction. Default: true
     */
    simulate?: boolean;
  }) => Promise<AssembledTransaction<i128>>;

  /**
   * Construct and simulate a balance transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Returns the current balance a player holds in the game for wagering.
   */
  balance: (
    { player }: { player: string },
    options?: {
      /**
       * The fee to pay for the transaction. Default: BASE_FEE
       */
      fee?: number;

      /**
       * The maximum amount of time to wait for the transaction to complete. Default: DEFAULT_TIMEOUT
       */
      timeoutInSeconds?: number;

      /**
       * Whether to automatically simulate the transaction when constructing the AssembledTransaction. Default: true
       */
      simulate?: boolean;
    },
  ) => Promise<AssembledTransaction<i128>>;

  /**
   * Construct and simulate a deposit transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * * Deposits the token into the contract for wagering.
   *      *
   *      * # Arguments
   *      *
   *      * `to` - The address from which to take `amount` and transfer to the contract.
   *      * `amount` - The quantity of the token to transfer.
   *      *
   *      * # Returns
   *      *
   *      * The current balance of the account after this deposit.
   */
  deposit: (
    { to, amount }: { to: string; amount: i128 },
    options?: {
      /**
       * The fee to pay for the transaction. Default: BASE_FEE
       */
      fee?: number;

      /**
       * The maximum amount of time to wait for the transaction to complete. Default: DEFAULT_TIMEOUT
       */
      timeoutInSeconds?: number;

      /**
       * Whether to automatically simulate the transaction when constructing the AssembledTransaction. Default: true
       */
      simulate?: boolean;
    },
  ) => Promise<AssembledTransaction<i128>>;

  /**
   * Construct and simulate a withdraw transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * * Withdraws funds for an account.
   *      *
   *      * # Arguments
   *      *
   *      * - `from` - The account for which to perform a withdrawal
   *      *
   *      * # Returns
   *      *
   *      * The amount withdrawn, for reference.
   */
  withdraw: (
    { from }: { from: string },
    options?: {
      /**
       * The fee to pay for the transaction. Default: BASE_FEE
       */
      fee?: number;

      /**
       * The maximum amount of time to wait for the transaction to complete. Default: DEFAULT_TIMEOUT
       */
      timeoutInSeconds?: number;

      /**
       * Whether to automatically simulate the transaction when constructing the AssembledTransaction. Default: true
       */
      simulate?: boolean;
    },
  ) => Promise<AssembledTransaction<i128>>;

  /**
   * Construct and simulate a score transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Returns the current score for a player, assuming they're in a match.
   */
  score: (
    { player }: { player: string },
    options?: {
      /**
       * The fee to pay for the transaction. Default: BASE_FEE
       */
      fee?: number;

      /**
       * The maximum amount of time to wait for the transaction to complete. Default: DEFAULT_TIMEOUT
       */
      timeoutInSeconds?: number;

      /**
       * Whether to automatically simulate the transaction when constructing the AssembledTransaction. Default: true
       */
      simulate?: boolean;
    },
  ) => Promise<AssembledTransaction<u32>>;

  /**
   * Construct and simulate a engage transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * * Begins a match between two players.
   *      *
   *      * If both players authorize beginning a match, this will set the game up
   *      * by holding the wager amount in the contract as an escrow mechanism. It
   *      * then randomly decides on who should go first, returning that address.
   *      *
   *      * It will also emit an event corresponding to the initialization of the
   *      * match, with the topics ["match", "Player A", "Player B"] and the data
   *      * field being the address that goes first. This should allow players to
   *      * observe the beginning of the match without necessarily being the ones
   *      * to submit the invocation.
   *      *
   *      * # Arguments
   *      *
   *      * `a` - The player on one side of the match
   *      * `b` - The player on the other side of the match
   *      *
   *      * # Returns
   *      *
   *      * The address of the player who should go (call `roll`) first.
   *      *
   *      * # Panics
   *      *
   *      * - If either player is already in a game.
   *      * - If a player doesn't have a sufficient amount deposited to wager a game
   *
   */
  engage: (
    { a, b }: { a: string; b: string },
    options?: {
      /**
       * The fee to pay for the transaction. Default: BASE_FEE
       */
      fee?: number;

      /**
       * The maximum amount of time to wait for the transaction to complete. Default: DEFAULT_TIMEOUT
       */
      timeoutInSeconds?: number;

      /**
       * Whether to automatically simulate the transaction when constructing the AssembledTransaction. Default: true
       */
      simulate?: boolean;
    },
  ) => Promise<AssembledTransaction<string>>;

  /**
   * Construct and simulate a roll transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * * Performs a single roll in the game of Farkle.
   *      *
   *      * In Farkle, games are played with rounds. In each round, you perform multiple
   *      * rolls, either setting aside dice to accumulate to your turn's score and
   *      * rolling again, or setting aside + passing to lock in your turn's score and
   *      * add it to your accumulated total score.
   *      *
   *      * First to 2000 wins!
   *      *
   *      * # Arguments
   *      *
   *      * `player` - The person who is rolling the dice.
   *      * `save` - A list of indices into the dice to keep from the previous roll.
   *      *
   *      *      In other words, if the previous `roll` call returned a 4-dice roll
   *      *      with `[1, 6, 2, 1]` (because you've already set the other two aside),
   *      *      and you wanted to keep both 1s, the `save` list should be [0, 3]
   *      *      because you want to keep the 1st and 4th dice (0-based indexing).
   *      * `stop` - Whether or not you want to stop after this accumulation of points.
   *      *
   *      * # Returns
   *      *
   *      * A list representing the latest d
   */
  roll: (
    { player, save, stop }: { player: string; save: Array<u32>; stop: boolean },
    options?: {
      /**
       * The fee to pay for the transaction. Default: BASE_FEE
       */
      fee?: number;

      /**
       * The maximum amount of time to wait for the transaction to complete. Default: DEFAULT_TIMEOUT
       */
      timeoutInSeconds?: number;

      /**
       * Whether to automatically simulate the transaction when constructing the AssembledTransaction. Default: true
       */
      simulate?: boolean;
    },
  ) => Promise<AssembledTransaction<Array<u32>>>;

  /**
   * Construct and simulate a token transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Returns the token address being used for wagers.
   */
  token: (options?: {
    /**
     * The fee to pay for the transaction. Default: BASE_FEE
     */
    fee?: number;

    /**
     * The maximum amount of time to wait for the transaction to complete. Default: DEFAULT_TIMEOUT
     */
    timeoutInSeconds?: number;

    /**
     * Whether to automatically simulate the transaction when constructing the AssembledTransaction. Default: true
     */
    simulate?: boolean;
  }) => Promise<AssembledTransaction<string>>;

  /**
   * Construct and simulate a check_init transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Panics if the contract isn't initialized.
   */
  check_init: (options?: {
    /**
     * The fee to pay for the transaction. Default: BASE_FEE
     */
    fee?: number;

    /**
     * The maximum amount of time to wait for the transaction to complete. Default: DEFAULT_TIMEOUT
     */
    timeoutInSeconds?: number;

    /**
     * Whether to automatically simulate the transaction when constructing the AssembledTransaction. Default: true
     */
    simulate?: boolean;
  }) => Promise<AssembledTransaction<null>>;

  /**
   * Construct and simulate a bump_match_ttl transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Bumps the time-to-live for a match between two players.
   */
  bump_match_ttl: (
    { a, b }: { a: string; b: string },
    options?: {
      /**
       * The fee to pay for the transaction. Default: BASE_FEE
       */
      fee?: number;

      /**
       * The maximum amount of time to wait for the transaction to complete. Default: DEFAULT_TIMEOUT
       */
      timeoutInSeconds?: number;

      /**
       * Whether to automatically simulate the transaction when constructing the AssembledTransaction. Default: true
       */
      simulate?: boolean;
    },
  ) => Promise<AssembledTransaction<null>>;

  /**
   * Construct and simulate a end_match transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  end_match: (
    { player, opp }: { player: string; opp: string },
    options?: {
      /**
       * The fee to pay for the transaction. Default: BASE_FEE
       */
      fee?: number;

      /**
       * The maximum amount of time to wait for the transaction to complete. Default: DEFAULT_TIMEOUT
       */
      timeoutInSeconds?: number;

      /**
       * Whether to automatically simulate the transaction when constructing the AssembledTransaction. Default: true
       */
      simulate?: boolean;
    },
  ) => Promise<AssembledTransaction<boolean>>;
}
export class Client extends ContractClient {
  static async deploy<T = Client>(
    /** Constructor/Initialization Args for the contract's `__constructor` method */
    { admin, token }: { admin: string; token: string },
    /** Options for initalizing a Client as well as for calling a method, with extras specific to deploying. */
    options: MethodOptions &
      Omit<ContractClientOptions, "contractId"> & {
        /** The hash of the Wasm blob, which must already be installed on-chain. */
        wasmHash: Buffer | string;
        /** Salt used to generate the contract's ID. Passed through to {@link Operation.createCustomContract}. Default: random. */
        salt?: Buffer | Uint8Array;
        /** The format used to decode `wasmHash`, if it's provided as a string. */
        format?: "hex" | "base64";
      },
  ): Promise<AssembledTransaction<T>> {
    return ContractClient.deploy({ admin, token }, options);
  }
  constructor(public readonly options: ContractClientOptions) {
    super(
      new ContractSpec([
        "AAAAAgAAAAAAAAAAAAAACFVzZXJEYXRhAAAABwAAAAAAAAAAAAAABVRva2VuAAAAAAAAAQAAAAAAAAAHQmFsYW5jZQAAAAABAAAAEwAAAAEAAAAAAAAABVNjb3JlAAAAAAAAAQAAABMAAAABAAAAAAAAAAlUdXJuU2NvcmUAAAAAAAABAAAAEwAAAAEAAAAAAAAABERpY2UAAAABAAAAEwAAAAEAAAAAAAAABU1hdGNoAAAAAAAAAQAAABMAAAABAAAAAAAAAARUdXJuAAAAAQAAABM=",
        "AAAAAgAAAAAAAAAAAAAACUFkbWluRGF0YQAAAAAAAAIAAAAAAAAAAAAAAAVUb2tlbgAAAAAAAAAAAAAAAAAABUFkbWluAAAA",
        "AAAABAAAAAAAAAAAAAAABUVycm9yAAAAAAAABwAAAAAAAAANSW52YWxpZEFtb3VudAAAAAAAAAAAAAAAAAAADk5vdEluaXRpYWxpemVkAAAAAAABAAAAAAAAAA5BbHJlYWR5UGxheWluZwAAAAAAAgAAAAAAAAAHVG9vUG9vcgAAAAADAAAAAAAAAAtOb3RZb3VyVHVybgAAAAAEAAAAAAAAAApXcm9uZ01hdGNoAAAAAAAFAAAAAAAAAApCYWREaWVIb2xkAAAAAAAG",
        "AAAAAAAAAK0qIEluaXRpYWxpemVzIHRoZSBnYW1lLgogICAgICoKICAgICAqICMgQXJndW1lbnRzCiAgICAgKgogICAgICogLSBgYWRtaW5gIC0gVGhlIG93bmVyIG9mIHRoaXMgaW5zdGFuY2Ugb2YgdGhlIGdhbWUuCiAgICAgKiAtIGB0b2tlbmAgLSBUaGUgdG9rZW4gdXNlZCBmb3Igd2FnZXJzIGluIHRoZSBnYW1lLgAAAAAAAA1fX2NvbnN0cnVjdG9yAAAAAAAAAgAAAAAAAAAFYWRtaW4AAAAAAAATAAAAAAAAAAV0b2tlbgAAAAAAABMAAAAA",
        "AAAAAAAAAChSZXR1cm5zIHRoZSBjdXJyZW50IHZlcnNpb24gb2YgdGhlIGdhbWUuAAAAB3ZlcnNpb24AAAAAAAAAAAEAAAAE",
        "AAAAAAAAADJSZXR1cm5zIHRoZSBjdXJyZW50IHdhZ2VyIC8gY29zdCB0byBwbGF5IHRoZSBnYW1lLgAAAAAABXdhZ2VyAAAAAAAAAAAAAAEAAAAL",
        "AAAAAAAAADxBbGxvd3MgdGhlIGFkbWluIHRvIHVwZ3JhZGUgdGhlIGNvbnRyYWN0IHRvIGEgbmV3IFdhc20gYmxvYi4AAAAHdXBncmFkZQAAAAABAAAAAAAAAA1uZXdfd2FzbV9oYXNoAAAAAAAD7gAAACAAAAAA",
        "AAAAAAAAAQQqIE9mZmVycyBhIHBzZXVkby1zaHV0ZG93biBtZWNoYW5pc20gdGhhdCBkZS1pbml0aWFsaXplcyBldmVyeXRoaW5nLgogICAgICoKICAgICAqIFdlIHNheSAicHNldWRvIiBiZWNhdXNlIHRoZSBjb250cmFjdCBjb250aW51ZXMgdG8gZXhpc3QsIGJ1dCBub25lIG9mIHRoZQogICAgICogbWV0aG9kcyB3aWxsIHdvcmsgYmVzaWRlcyBgd2l0aGRyYXdgLCBhbGxvd2luZyBwbGF5ZXJzIHRvIHB1bGwgb3V0CiAgICAgKiB0aGVpciBjdXJyZW50IGhvbGRpbmdzLgAAAAhzaHV0ZG93bgAAAAAAAAABAAAACw==",
        "AAAAAAAAAERSZXR1cm5zIHRoZSBjdXJyZW50IGJhbGFuY2UgYSBwbGF5ZXIgaG9sZHMgaW4gdGhlIGdhbWUgZm9yIHdhZ2VyaW5nLgAAAAdiYWxhbmNlAAAAAAEAAAAAAAAABnBsYXllcgAAAAAAEwAAAAEAAAAL",
        "AAAAAAAAAT8qIERlcG9zaXRzIHRoZSB0b2tlbiBpbnRvIHRoZSBjb250cmFjdCBmb3Igd2FnZXJpbmcuCiAgICAgKgogICAgICogIyBBcmd1bWVudHMKICAgICAqCiAgICAgKiBgdG9gIC0gVGhlIGFkZHJlc3MgZnJvbSB3aGljaCB0byB0YWtlIGBhbW91bnRgIGFuZCB0cmFuc2ZlciB0byB0aGUgY29udHJhY3QuCiAgICAgKiBgYW1vdW50YCAtIFRoZSBxdWFudGl0eSBvZiB0aGUgdG9rZW4gdG8gdHJhbnNmZXIuCiAgICAgKgogICAgICogIyBSZXR1cm5zCiAgICAgKgogICAgICogVGhlIGN1cnJlbnQgYmFsYW5jZSBvZiB0aGUgYWNjb3VudCBhZnRlciB0aGlzIGRlcG9zaXQuAAAAAAdkZXBvc2l0AAAAAAIAAAAAAAAAAnRvAAAAAAATAAAAAAAAAAZhbW91bnQAAAAAAAsAAAABAAAACw==",
        "AAAAAAAAAM0qIFdpdGhkcmF3cyBmdW5kcyBmb3IgYW4gYWNjb3VudC4KICAgICAqCiAgICAgKiAjIEFyZ3VtZW50cwogICAgICoKICAgICAqIC0gYGZyb21gIC0gVGhlIGFjY291bnQgZm9yIHdoaWNoIHRvIHBlcmZvcm0gYSB3aXRoZHJhd2FsCiAgICAgKgogICAgICogIyBSZXR1cm5zCiAgICAgKgogICAgICogVGhlIGFtb3VudCB3aXRoZHJhd24sIGZvciByZWZlcmVuY2UuAAAAAAAACHdpdGhkcmF3AAAAAQAAAAAAAAAEZnJvbQAAABMAAAABAAAACw==",
        "AAAAAAAAAERSZXR1cm5zIHRoZSBjdXJyZW50IHNjb3JlIGZvciBhIHBsYXllciwgYXNzdW1pbmcgdGhleSdyZSBpbiBhIG1hdGNoLgAAAAVzY29yZQAAAAAAAAEAAAAAAAAABnBsYXllcgAAAAAAEwAAAAEAAAAE",
        "AAAAAAAABAAqIEJlZ2lucyBhIG1hdGNoIGJldHdlZW4gdHdvIHBsYXllcnMuCiAgICAgKgogICAgICogSWYgYm90aCBwbGF5ZXJzIGF1dGhvcml6ZSBiZWdpbm5pbmcgYSBtYXRjaCwgdGhpcyB3aWxsIHNldCB0aGUgZ2FtZSB1cAogICAgICogYnkgaG9sZGluZyB0aGUgd2FnZXIgYW1vdW50IGluIHRoZSBjb250cmFjdCBhcyBhbiBlc2Nyb3cgbWVjaGFuaXNtLiBJdAogICAgICogdGhlbiByYW5kb21seSBkZWNpZGVzIG9uIHdobyBzaG91bGQgZ28gZmlyc3QsIHJldHVybmluZyB0aGF0IGFkZHJlc3MuCiAgICAgKgogICAgICogSXQgd2lsbCBhbHNvIGVtaXQgYW4gZXZlbnQgY29ycmVzcG9uZGluZyB0byB0aGUgaW5pdGlhbGl6YXRpb24gb2YgdGhlCiAgICAgKiBtYXRjaCwgd2l0aCB0aGUgdG9waWNzIFsibWF0Y2giLCAiUGxheWVyIEEiLCAiUGxheWVyIEIiXSBhbmQgdGhlIGRhdGEKICAgICAqIGZpZWxkIGJlaW5nIHRoZSBhZGRyZXNzIHRoYXQgZ29lcyBmaXJzdC4gVGhpcyBzaG91bGQgYWxsb3cgcGxheWVycyB0bwogICAgICogb2JzZXJ2ZSB0aGUgYmVnaW5uaW5nIG9mIHRoZSBtYXRjaCB3aXRob3V0IG5lY2Vzc2FyaWx5IGJlaW5nIHRoZSBvbmVzCiAgICAgKiB0byBzdWJtaXQgdGhlIGludm9jYXRpb24uCiAgICAgKgogICAgICogIyBBcmd1bWVudHMKICAgICAqCiAgICAgKiBgYWAgLSBUaGUgcGxheWVyIG9uIG9uZSBzaWRlIG9mIHRoZSBtYXRjaAogICAgICogYGJgIC0gVGhlIHBsYXllciBvbiB0aGUgb3RoZXIgc2lkZSBvZiB0aGUgbWF0Y2gKICAgICAqCiAgICAgKiAjIFJldHVybnMKICAgICAqCiAgICAgKiBUaGUgYWRkcmVzcyBvZiB0aGUgcGxheWVyIHdobyBzaG91bGQgZ28gKGNhbGwgYHJvbGxgKSBmaXJzdC4KICAgICAqCiAgICAgKiAjIFBhbmljcwogICAgICoKICAgICAqIC0gSWYgZWl0aGVyIHBsYXllciBpcyBhbHJlYWR5IGluIGEgZ2FtZS4KICAgICAqIC0gSWYgYSBwbGF5ZXIgZG9lc24ndCBoYXZlIGEgc3VmZmljaWVudCBhbW91bnQgZGVwb3NpdGVkIHRvIHdhZ2VyIGEgZ2FtZQogICAgAAAABmVuZ2FnZQAAAAAAAgAAAAAAAAABYQAAAAAAABMAAAAAAAAAAWIAAAAAAAATAAAAAQAAABM=",
        "AAAAAAAABAAqIFBlcmZvcm1zIGEgc2luZ2xlIHJvbGwgaW4gdGhlIGdhbWUgb2YgRmFya2xlLgogICAgICoKICAgICAqIEluIEZhcmtsZSwgZ2FtZXMgYXJlIHBsYXllZCB3aXRoIHJvdW5kcy4gSW4gZWFjaCByb3VuZCwgeW91IHBlcmZvcm0gbXVsdGlwbGUKICAgICAqIHJvbGxzLCBlaXRoZXIgc2V0dGluZyBhc2lkZSBkaWNlIHRvIGFjY3VtdWxhdGUgdG8geW91ciB0dXJuJ3Mgc2NvcmUgYW5kCiAgICAgKiByb2xsaW5nIGFnYWluLCBvciBzZXR0aW5nIGFzaWRlICsgcGFzc2luZyB0byBsb2NrIGluIHlvdXIgdHVybidzIHNjb3JlIGFuZAogICAgICogYWRkIGl0IHRvIHlvdXIgYWNjdW11bGF0ZWQgdG90YWwgc2NvcmUuCiAgICAgKgogICAgICogRmlyc3QgdG8gMjAwMCB3aW5zIQogICAgICoKICAgICAqICMgQXJndW1lbnRzCiAgICAgKgogICAgICogYHBsYXllcmAgLSBUaGUgcGVyc29uIHdobyBpcyByb2xsaW5nIHRoZSBkaWNlLgogICAgICogYHNhdmVgIC0gQSBsaXN0IG9mIGluZGljZXMgaW50byB0aGUgZGljZSB0byBrZWVwIGZyb20gdGhlIHByZXZpb3VzIHJvbGwuCiAgICAgKgogICAgICogICAgICBJbiBvdGhlciB3b3JkcywgaWYgdGhlIHByZXZpb3VzIGByb2xsYCBjYWxsIHJldHVybmVkIGEgNC1kaWNlIHJvbGwKICAgICAqICAgICAgd2l0aCBgWzEsIDYsIDIsIDFdYCAoYmVjYXVzZSB5b3UndmUgYWxyZWFkeSBzZXQgdGhlIG90aGVyIHR3byBhc2lkZSksCiAgICAgKiAgICAgIGFuZCB5b3Ugd2FudGVkIHRvIGtlZXAgYm90aCAxcywgdGhlIGBzYXZlYCBsaXN0IHNob3VsZCBiZSBbMCwgM10KICAgICAqICAgICAgYmVjYXVzZSB5b3Ugd2FudCB0byBrZWVwIHRoZSAxc3QgYW5kIDR0aCBkaWNlICgwLWJhc2VkIGluZGV4aW5nKS4KICAgICAqIGBzdG9wYCAtIFdoZXRoZXIgb3Igbm90IHlvdSB3YW50IHRvIHN0b3AgYWZ0ZXIgdGhpcyBhY2N1bXVsYXRpb24gb2YgcG9pbnRzLgogICAgICoKICAgICAqICMgUmV0dXJucwogICAgICoKICAgICAqIEEgbGlzdCByZXByZXNlbnRpbmcgdGhlIGxhdGVzdCBkAAAABHJvbGwAAAADAAAAAAAAAAZwbGF5ZXIAAAAAABMAAAAAAAAABHNhdmUAAAPqAAAABAAAAAAAAAAEc3RvcAAAAAEAAAABAAAD6gAAAAQ=",
        "AAAAAAAAADBSZXR1cm5zIHRoZSB0b2tlbiBhZGRyZXNzIGJlaW5nIHVzZWQgZm9yIHdhZ2Vycy4AAAAFdG9rZW4AAAAAAAAAAAAAAQAAABM=",
        "AAAAAAAAAClQYW5pY3MgaWYgdGhlIGNvbnRyYWN0IGlzbid0IGluaXRpYWxpemVkLgAAAAAAAApjaGVja19pbml0AAAAAAAAAAAAAA==",
        "AAAAAAAAADdCdW1wcyB0aGUgdGltZS10by1saXZlIGZvciBhIG1hdGNoIGJldHdlZW4gdHdvIHBsYXllcnMuAAAAAA5idW1wX21hdGNoX3R0bAAAAAAAAgAAAAAAAAABYQAAAAAAABMAAAAAAAAAAWIAAAAAAAATAAAAAA==",
        "AAAAAAAAAAAAAAAJZW5kX21hdGNoAAAAAAAAAgAAAAAAAAAGcGxheWVyAAAAAAATAAAAAAAAAANvcHAAAAAAEwAAAAEAAAAB",
      ]),
      options,
    );
  }
  public readonly fromJSON = {
    version: this.txFromJSON<u32>,
    wager: this.txFromJSON<i128>,
    upgrade: this.txFromJSON<null>,
    shutdown: this.txFromJSON<i128>,
    balance: this.txFromJSON<i128>,
    deposit: this.txFromJSON<i128>,
    withdraw: this.txFromJSON<i128>,
    score: this.txFromJSON<u32>,
    engage: this.txFromJSON<string>,
    roll: this.txFromJSON<Array<u32>>,
    token: this.txFromJSON<string>,
    check_init: this.txFromJSON<null>,
    bump_match_ttl: this.txFromJSON<null>,
    end_match: this.txFromJSON<boolean>,
  };
}
