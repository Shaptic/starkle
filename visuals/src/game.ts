import {
  Address,
  BASE_FEE,
  nativeToScVal,
  scValToNative,
  xdr,
} from "@stellar/stellar-sdk";
import { makeClient } from "./contracts/helpers";
import { CONTRACT_ID } from "./contracts/constants";
import { Api } from "@stellar/stellar-sdk/rpc";
import {
  AssembledTransaction,
  SentTransaction,
} from "@stellar/stellar-sdk/contract";
import { IWallet } from "./iwallet";

export async function roll(
  w: IWallet,
  opponent: string,
  save?: number[],
  stop?: boolean,
): Promise<number[]> {
  const readFeeOffset = Math.ceil(5 * (6250 + 1786));
  const { address } = await w.getAddress();

  const cli = await makeClient(w);
  const txn = await cli.roll(
    {
      player: address,
      save: save ?? [],
      stop: stop ?? false,
    },
    {
      ...(!stop && { fee: parseInt(BASE_FEE) + readFeeOffset }),
    },
  );

  // There is the case in which simulation returns a successful re-roll, but the
  // real execution returns a bust (due to RNG). This causes an "unexpected"
  // read on a bunch of ledger keys and fails. To safeguard against this, we
  // need to include those here.
  if (!stop) {
    // The four add'l keys are:
    //
    // TurnScore(player: Address) -> u32
    // Dice(player: Address) -> Vec<u32; 6>
    // Turn(player: Address) -> Address
    // Turn(opponent: Address) -> Address
    //
    // This leads to a read/write fee deviation from simulation, so pad for that.
    const addlPad = 1000;
    const addlKeys = [
      buildLedgerKey("TurnScore", address),
      buildLedgerKey("Dice", address),
      buildLedgerKey("Turn", address),
      buildLedgerKey("Turn", opponent),
    ];

    // Tweak the simulated data to append the keys.
    if (Api.isSimulationSuccess(txn.simulation!)) {
      const built = txn.simulation.transactionData.build();
      const instructions = built.resources().instructions();
      const readBytes = built.resources().readBytes();
      const writeBytes = built.resources().writeBytes();

      const fee = built.resourceFee();
      const newFee = fee.toBigInt() + BigInt(readFeeOffset); // 4 more key reads

      const rwKeys: string[] = addlKeys.map((key) => key.toXDR("base64"));

      txn.simulation.transactionData
        // A key can't be in both (nor twice in one section), so make sure we
        // filter the new ones out of both the current read keys and the
        // read-write keys.
        .setReadWrite(
          txn.simulation.transactionData
            .getReadWrite()
            .filter((key) => !rwKeys.includes(key.toXDR("base64")))
            .concat(addlKeys),
        )
        .setReadOnly(
          txn.simulation.transactionData
            .getReadOnly()
            .filter((key) => !rwKeys.includes(key.toXDR("base64"))),
        )
        .setResources(
          instructions,
          Math.ceil(readBytes + addlPad),
          Math.ceil(writeBytes + addlPad),
        )
        .setResourceFee(newFee.toString()); // TODO: BigInt.asIntN(64, newFee)); // cap at 2^63-1
    }
  }

  return yeeter(txn);
}

export async function yeeter<T>(txn: AssembledTransaction<T>): Promise<any> {
  let r: SentTransaction<T> | null = null;
  try {
    r = await txn.signAndSend();
  } catch (e) {
    console.debug("Transaction envelope:", txn.built!.toXDR());
    console.error(e);
    console.log("Returning rejection...");
    return Promise.reject(e);
  } finally {
    console.debug("Transaction envelope:", txn.signed?.toXDR());
    r?.sendTransactionResponse?.diagnosticEvents?.forEach((evt) => {
      console.error(evt.toXDR("base64"));
    });
  }
  console.debug("Transaction status:", r.getTransactionResponse?.status);

  switch (r.getTransactionResponse?.status) {
    case Api.GetTransactionStatus.SUCCESS:
    case Api.GetTransactionStatus.FAILED:
      console.log(r.getTransactionResponse.resultMetaXdr.toXDR("base64"));
      break;

    default:
      console.log(r);
  }

  switch (r.getTransactionResponse?.status) {
    case Api.GetTransactionStatus.SUCCESS:
      return scValToNative(r.getTransactionResponse.returnValue!);

    case Api.GetTransactionStatus.FAILED:
      r.getTransactionResponse.diagnosticEventsXdr?.forEach((evt, i) => {
        console.error(`Event ${i + 1}:`, evt);
        console.error(`Event ${i + 1}:`, evt.toXDR("base64"));
      });
      break;
  }
}

export function scoreDice(dice: number[]): number {
  // This is ported directly from Farkle::score_turn with add'l convenient
  // non-smart-contract-isms.
  const groups = new Map<number, number>();
  dice.forEach((die) => {
    groups.set(die, (groups.get(die) ?? 0) + 1);
  });
  const indiv = Array.from(dice.keys());

  const arrEq = (a: number[], b: number[]): boolean => {
    return a.length === b.length && a.every((x, i) => x === b[i]);
  };

  let score = 0;

  if (arrEq(indiv, [1, 2, 3, 4, 5, 6])) {
    score = 1500;
    return score;
  } else if (arrEq(indiv, [1, 2, 3, 4, 5])) {
    score += 500;

    groups.forEach((die, count) => {
      if (die <= 5) {
        groups.set(die, count - 1);
      }
    });
  } else if (arrEq(indiv, [2, 3, 4, 5, 6])) {
    score += 750;

    groups.forEach((die, count) => {
      if (die >= 2 && die <= 6) {
        groups.set(die, count - 1);
      }
    });
  }

  [1, 2, 3, 4, 5, 6].forEach((val) => {
    let count = Math.max(0, groups.get(val) ?? 0);
    if (count < 3) {
      // irrelevant
      return;
    }

    let base = val === 1 ? 1000 : val * 100;

    // Each add'l die after 3 doubles the value.
    if (count > 3) {
      base *= Math.pow(2, count - 3);
    }
    score += base;

    groups.set(val, 0);
  });

  // Now lets count any straggler 1s or 5s.
  score += 100 * (groups.get(1) ?? 0);
  score += 50 * (groups.get(5) ?? 0);

  return score;
}

function buildLedgerKey(enumName: string, pk: string): xdr.LedgerKey {
  return xdr.LedgerKey.contractData(
    new xdr.LedgerKeyContractData({
      contract: new Address(CONTRACT_ID).toScAddress(),
      key: xdr.ScVal.scvVec([
        nativeToScVal(enumName, { type: "symbol" }),
        nativeToScVal(pk, { type: "address" }),
      ]),
      durability: xdr.ContractDataDurability.temporary(),
    }),
  );
}

// Change the list of raw dice into "1, 1, and 5", for example, or just "a 1" if
// it's singular.
export function dice2words(dice: number[]): string {
  if (dice.length === 1) {
    return `a ${dice[0]}`;
  }

  const comma = dice.length > 2 ? "," : "";
  const sorted = Array.from(dice).sort(); // don't change passed param
  return `${sorted.slice(0, -1).join(", ")}${comma} and ${sorted.slice(-1)}`;
}
