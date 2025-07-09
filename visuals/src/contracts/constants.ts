import { Networks } from "@stellar/stellar-sdk";

export const ONE_XLM = 10_000_000n;
export const SERVER_URL = "https://soroban-testnet.stellar.org";
export const HORIZON_URL = "https://horizon-testnet.stellar.org";
export const CONTRACT_ID =
  "CDYTZZSG3IL7XWDUNNVHD5MZ4AVIPH2EQVCA6XWFGSUVL3CXFOBHVQWA";
export const FORFEIT_DURATION = 180;
export const PASSPHRASE = Networks.TESTNET;
export const WS_ADDR =
  import.meta.env.MODE === "development"
    ? "http://localhost:5000"
    : window.location.toString();
