import { scValToNative, xdr } from "@stellar/stellar-sdk";

export interface FarkleEvent {
  type: string;
  player: string;
}

export interface MatchEvent extends FarkleEvent {
  type: "match";
  otherPlayer: string;
  first: string;
}

export interface RollEvent extends FarkleEvent {
  type: "roll";
  dice: number[];
}

export interface HoldEvent extends FarkleEvent {
  type: "reroll";
  dice: number[];
  score: number;
  stop: boolean;
}

export interface BustEvent extends FarkleEvent {
  type: "bust";
  dice: number[];
}

export interface WinEvent extends FarkleEvent {
  type: "win";
  score: number;
}

export function convertEvent(
  topics: xdr.ScVal[],
  value: xdr.ScVal,
): FarkleEvent {
  let t: any[] = topics.map((t) => scValToNative(t));
  let v: any = scValToNative(value);

  switch (t[0]) {
    case "match":
      return {
        type: t[0],
        player: t[1],
        otherPlayer: t[2],
        first: v,
      } as MatchEvent;

    case "roll":
      return {
        type: t[0],
        player: t[1],
        dice: v,
      } as RollEvent;

    case "reroll":
      return {
        type: t[0],
        player: t[1],
        dice: v[0],
        score: v[1],
        stop: v[2],
      } as HoldEvent;

    case "bust":
      return {
        type: t[0],
        player: t[1],
        dice: v,
      } as BustEvent;

    case "win":
      return {
        type: t[0],
        player: t[1],
        score: v,
      } as WinEvent;

    default:
      throw topics;
  }
}
