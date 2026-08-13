(() => {
  "use strict";

  const host = window.location.hostname.toLowerCase();
  if (host !== "youtube.com" && !host.endsWith(".youtube.com")) {
    return;
  }

  const pausedDialogMessages = new Set([
    "video paused. continue watching?",
    "video has been paused. continue watching?",
    "video \u0111\u00e3 t\u1ea1m d\u1eebng. ti\u1ebfp t\u1ee5c xem?",
  ]);
  const handledDialogs = new WeakSet();

  const normalize = (value) =>
    value.replace(/\s+/g, " ").trim().toLocaleLowerCase();

  const dismissPausedDialogs = () => {
    for (const dialog of document.querySelectorAll(
      "yt-confirm-dialog-renderer",
    )) {
      if (handledDialogs.has(dialog)) {
        continue;
      }

      const message = normalize(dialog.textContent || "");
      const isPausedDialog = [...pausedDialogMessages].some((candidate) =>
        message.includes(candidate),
      );
      if (!isPausedDialog) {
        continue;
      }

      const confirmButton = dialog.querySelector(
        "#confirm-button button, button#confirm-button, yt-button-renderer#confirm-button button",
      );
      if (!confirmButton || confirmButton.disabled) {
        continue;
      }

      handledDialogs.add(dialog);
      confirmButton.click();
    }
  };

  const start = () => {
    dismissPausedDialogs();

    const observer = new MutationObserver(dismissPausedDialogs);
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
    });

    window.setInterval(dismissPausedDialogs, 15_000);
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }
})();
