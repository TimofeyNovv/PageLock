(function () {
  if (window.top !== window) {
    return;
  }

  const api = globalThis.PageLockApi;
  let activeLock = null;

  function removeOverlay() {
    const overlay = document.getElementById("pagelock-overlay");

    if (overlay) {
      overlay.remove();
    }

    document.documentElement.classList.remove("pagelock-locked");
    activeLock = null;
  }

  function appendOverlay(overlay) {
    const parent = document.body || document.documentElement;
    parent.appendChild(overlay);
  }

  function createLockScreen(siteKey, record) {
    removeOverlay();
    activeLock = { siteKey, record };
    document.documentElement.classList.add("pagelock-locked");

    const overlay = document.createElement("div");
    overlay.id = "pagelock-overlay";

    const panel = document.createElement("form");
    panel.id = "pagelock-panel";

    const title = document.createElement("h1");
    title.textContent = "PageLock";

    const text = document.createElement("p");
    text.textContent = `Сайт ${siteKey} заблокирован. Введи пароль, чтобы открыть его в этой вкладке.`;

    const label = document.createElement("label");
    label.htmlFor = "pagelock-password";
    label.textContent = "Пароль";

    const input = document.createElement("input");
    input.id = "pagelock-password";
    input.type = "password";
    input.autocomplete = "current-password";
    input.required = true;

    const button = document.createElement("button");
    button.type = "submit";
    button.textContent = "Разблокировать";

    const error = document.createElement("div");
    error.id = "pagelock-error";
    error.setAttribute("aria-live", "polite");

    panel.append(title, text, label, input, button, error);
    overlay.appendChild(panel);

    panel.addEventListener("submit", async (event) => {
      event.preventDefault();
      button.disabled = true;
      error.textContent = "";

      const isPasswordValid = await PageLockCrypto.verifyPassword(input.value, record);

      if (!isPasswordValid) {
        error.textContent = "Неверный пароль.";
        input.value = "";
        input.focus();
        button.disabled = false;
        return;
      }

      await api.runtime.sendMessage({
        type: "PAGELOCK_UNLOCK_TAB",
        siteKey
      });

      removeOverlay();
    });

    appendOverlay(overlay);
    input.focus();
  }

  async function checkCurrentPage() {
    const url = new URL(location.href);

    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return;
    }

    const result = await api.storage.local.get({ blockedSites: {} });
    const blockedSite = PageLockSite.findBlockedSite(url.hostname, result.blockedSites);

    if (!blockedSite) {
      removeOverlay();
      return;
    }

    const unlockState = await api.runtime.sendMessage({
      type: "PAGELOCK_IS_UNLOCKED",
      siteKey: blockedSite.siteKey
    });

    if (!unlockState.unlocked) {
      createLockScreen(blockedSite.siteKey, blockedSite.record);
    }
  }

  api.runtime.onMessage.addListener((message) => {
    if (message.type === "PAGELOCK_RECHECK") {
      checkCurrentPage();
    }

    if (message.type === "PAGELOCK_REMOVE_OVERLAY" && activeLock && activeLock.siteKey === message.siteKey) {
      removeOverlay();
    }
  });

  checkCurrentPage();
})();
