import $ from "jquery";

export function modalCancellable(action?: CallableFunction) {
  const modalContent = $(".waiting-modal-content");
  modalRemoveBtn(); // remove existing button, if any
  modalContent.append(
    $("<button>")
      .addClass("close-button")
      .on("click", () => {
        // Put the spinner back and remove the close button.
        modalContent.children("div").removeClass().addClass("spinner");
        modalRemoveBtn();
        $("#wait-status").text("");
        $("#waitingModal").hide();

        if (action) action();
      })
      .html("&times;"),
  );
}
export function modalRemoveBtn() {
  $(".waiting-modal-content button").remove();
}

export function modalFailure(text: string, fn?: CallableFunction) {
  modalShow(text, "error-icon");
  modalCancellable(fn);
}

export function modalSuccess(text: string, fn?: CallableFunction) {
  modalShow(text, "check-icon").html("&#10003;");
  modalCancellable(fn);
}

export function modalSpin(text: string, fn?: CallableFunction) {
  modalShow(text, "spinner");
  if (fn) {
    modalCancellable(fn);
  }
}

function modalShow(text: string, cls: string) {
  $("#waitingModal").css("display", "flex");
  $("#wait-status").text(text);

  const modalContent = $(".waiting-modal-content");
  return modalContent.children("div").removeClass().addClass(cls).html("");
}

/**
 * Displays a transparent popup in the center of the game window.
 *
 * @param {string} message - The text to display inside the popup.
 * @param {string} color - A CSS color string for the text (e.g., "#FF0000").
 * @param {number} [duration=3000] - How long (in ms) to display the popup before fading out.
 */
export function showPopup(
  message: string,
  color: string = "#eee",
  duration: number = 3000,
) {
  // Try to reuse an existing popup element
  let popup = $("#popup");
  if (popup.length === 0) {
    popup = $('<div id="popup">').addClass("popup");
    $(document.body).append(popup);
  }

  // Set the popup text and text color, removing any previous hides.
  popup.html(message).css("color", color).removeClass("hide");

  // Trigger reflow to restart the animation if necessary.
  void popup.get(0)!.offsetWidth;

  // Add the show class to animate it in.
  popup.addClass("show");

  // After the specified duration, remove the "show" class and add "hide" to fade out.
  setTimeout(() => {
    popup.removeClass("show");
    popup.addClass("hide");
  }, duration);
}

// This function displays the top popup.
export function showTopPopup(text: string) {
  const popup = $("#topPopup").text(text);
  // Add the "show" class to trigger the slide in/out animation.
  popup.addClass("show");

  // Optionally, remove the popup after the animation ends
  // (animation duration is 3s in this case)
  popup.on("animationend", () => {
    popup.removeClass("show");
  });
}
