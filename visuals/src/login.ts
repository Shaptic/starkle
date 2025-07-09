import "./styles/variables.css";
import "./styles/reset.css";
import "./styles/layout.css";
import "./styles/sidebar.css";
import "./styles/game.css";
import "./styles/chat.css";
import "./styles/buttons.css";
import "./styles/dice.css";
import "./styles/modal.css";
import "./styles/utilities.css";
import "./styles/responsive.css";
import "./styles/login.css";

import { StrKey } from "@stellar/stellar-sdk";
import $ from "jquery";
import { run } from "./main";

// import {
//   StellarWalletsKit,
//   WalletNetwork,
//   allowAllModules,
//   XBULL_ID
// } from '@creit.tech/stellar-wallets-kit';

// const kit: StellarWalletsKit = new StellarWalletsKit({
//   network: WalletNetwork.TESTNET,
//   selectedWalletId: XBULL_ID,
//   modules: allowAllModules(),
// });

// await kit.openModal()

// Ensure the document is fully loaded.
$(() => {
  // Auto-redirect if the user has already signed up.
  if (localStorage.getItem("signedUp")) {
    $("#landingContainer").hide();
    $(".container").show();
    run();
    return;
  }

  // When the wallet method selection changes, show/hide the secret key input.
  $("#landingForm").on("change", () => {
    if ($("#methodImport").is(":checked")) {
      $("#importKeyField").show();
    } else {
      $("#importKeyField").hide();
    }
  });

  // Handle form submission.
  $("#landingForm").on("submit", (e) => {
    e.preventDefault();

    // Read input values.
    const username: string = ($("#form-username").val() as string).trim();
    const walletMethod: string = $(
      "input[name='walletMethod']:checked",
    ).val() as string;
    const secretKey: string = ($("#secretKey").val() as string).trim();

    if (secretKey && !StrKey.isValidEd25519SecretSeed(secretKey)) {
      alert("Invalid secret key format!");
      return;
    }

    // Store values in localStorage.
    localStorage.setItem("signedUp", "true");
    localStorage.setItem("username", username);
    localStorage.setItem("walletMethod", walletMethod);
    if (walletMethod === "import") {
      localStorage.setItem("secretKey", secretKey);
    } else {
      localStorage.removeItem("secretKey");
    }

    $("#landingContainer").hide();
    $(".container").show();
    run();
  });
});
