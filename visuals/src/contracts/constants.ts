import { Networks } from "@stellar/stellar-sdk";

export const ONE_XLM = 10_000_000n;
export const SERVER_URL = "https://soroban-testnet.stellar.org";
export const HORIZON_URL = "https://horizon-testnet.stellar.org";
export const CONTRACT_ID =
  "CAFWLMYR5JHUOL2EICORMQ475FJGHOMJLI47JITOEK2UGUC7R5PIQJIK";
export const PASSPHRASE = Networks.TESTNET;
export const WS_ADDR =
  process.env["NODE_ENV"] === "development"
    ? "http://localhost:5000"
    : window.location.toString();
