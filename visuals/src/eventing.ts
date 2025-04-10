import { nativeToScVal, rpc as StellarRpc } from "@stellar/stellar-sdk";
import { Api, Server } from "@stellar/stellar-sdk/rpc";

import { CONTRACT_ID, SERVER_URL } from "./contracts/constants";
import { convertEvent, FarkleEvent } from "./contracts/events";

/**
 * Controls game event flows.
 *
 * Namely, this will indefinitely subscribe to RPC's getEvents and transform any
 * relevant events into strongly-typed structures which will then be emitted to
 * the rest of the system, allowing players to choose their dice, re-roll, etc.
 */
export class Eventing {
  // hook: HTMLSpanElement;
  listener?: number;
  rpc = new Server(SERVER_URL);

  constructor() {
    // Create an element that will act as an invisible "hook" for events.
    // this.hook = document.createElement("span");
    // document.body.append(this.hook);

    window.addEventListener("farkle", (event: Event) => {
      const e = (event as CustomEvent).detail as FarkleEvent;
      console.debug("Farkle Event:", e);

      // Re-dispatch the event to listeners looking for the specific type of
      // event that was received here.
      dispatchEvent(
        new CustomEvent(`farkle-${e.type}`, { bubbles: true, detail: e }),
      );
    });
  }

  stop() {
    clearInterval(this.listener);
  }

  listen(players: string[]) {
    const farkleFilter: StellarRpc.Api.EventFilter = {
      contractIds: [CONTRACT_ID],
      type: "contract",
      topics: players.map((p: string) => {
        // Track all events for both players.
        return ["*", nativeToScVal(p, { type: "address" }).toXDR("base64")];
      }),
    };

    let ll: Api.GetLatestLedgerResponse;
    let result: Api.GetEventsResponse;
    this.listener = setInterval(async () => {
      let new_ll = await this.rpc.getLatestLedger();
      if (ll && ll.sequence >= new_ll.sequence) {
        return;
      }
      ll = new_ll;

      if (!result) {
        result = await this.rpc.getEvents({
          filters: [farkleFilter],
          startLedger: ll.sequence - 10,
          limit: 100,
        });
      } else {
        result = await this.rpc.getEvents({
          filters: [farkleFilter],
          cursor: result.cursor,
          limit: 100,
        });
      }

      result.events.forEach((event) => {
        const e = convertEvent(event.topic, event.value);
        console.debug("Parsed RPC event:", e);

        // This invokes the event listener created in the constructor, which
        // will then disperse the generic FarkleEvent to the appropriate
        // listener(s).
        dispatchEvent(
          new CustomEvent("farkle", {
            detail: e,
            bubbles: true,
          }),
        );
      });
    }, 1500);
  }

  on(type: string, listener: EventListener) {
    window.addEventListener(`farkle-${type}`, listener);
  }
}
