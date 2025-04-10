import $ from "jquery";

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
    const username: string = localStorage.getItem("username") ?? "";
    const walletMethod: string = localStorage.getItem("walletMethod") ?? "";
    const secretKey: string = localStorage.getItem("secretKey") ?? "";

    // Fill in the hidden POST form values.
    $("#post_username").val(username);
    $("#post_method").val(walletMethod);
    $("#post_secretKey").val(walletMethod === "import" ? secretKey : "");

    // Submit the POST form to redirect without exposing sensitive information.
    $("#postForm").trigger("submit");
    return; // Skip the rest of the setup.
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
    const username: string = ($("#username").val() as string).trim();
    const walletMethod: string = $(
      "input[name='walletMethod']:checked",
    ).val() as string;
    const secretKey: string = ($("#secretKey").val() as string).trim();

    // Store values in localStorage.
    localStorage.setItem("signedUp", "true");
    localStorage.setItem("username", username);
    localStorage.setItem("walletMethod", walletMethod);
    if (walletMethod === "import") {
      localStorage.setItem("secretKey", secretKey);
    } else {
      localStorage.removeItem("secretKey");
    }

    // Fill the hidden POST form with values.
    $("#post_username").val(username);
    $("#post_method").val(walletMethod);
    $("#post_secretKey").val(walletMethod === "import" ? secretKey : "");

    // Submit the hidden POST form.
    $("#postForm").trigger("submit");
  });
});
