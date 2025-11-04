import { Networks } from "@stellar/stellar-sdk";

export const ONE_XLM = 10_000_000n;
export const SERVER_URL = "https://soroban-testnet.stellar.org";
export const HORIZON_URL = "https://horizon-testnet.stellar.org";
export const CONTRACT_ID =
  "CBEAAYMGWRDZ4HDQ4T4YPU5NRV24S2YGKXNV5SYF2UR3XNTUWU4D5Q5D";
export const REWARD_ID =
  "CDDOBB4QAEXQ5OETD626NCKAHF6SPRDITHE72CL3YCSD2RANGMLZCQTB";
export const FORFEIT_DURATION = 180;
export const PASSPHRASE = Networks.TESTNET;
export const WS_ADDR =
  import.meta.env.MODE === "development"
    ? "http://localhost:5000"
    : window.location.toString();
