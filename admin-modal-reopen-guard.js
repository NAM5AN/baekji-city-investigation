(() => {
  "use strict";

  const modalRoot = document.getElementById("admin-modal-root");
  if (!modalRoot || window.__BAEKJI_ADMIN_MODAL_REOPEN_GUARD__) return;

  let suppressObservationRestore = false;
  const descriptor = Object.getOwnPropertyDescriptor(Element.prototype, "innerHTML");

  function isObservationMarkup(value) {
    return String(value ?? "").includes("admin-observe-modal");
  }

  function setSuppressed(value) {
    suppressObservationRestore = Boolean(value);
    if (suppressObservationRestore) modalRoot.dataset.adminObservationClosed = "true";
    else delete modalRoot.dataset.adminObservationClosed;
  }

  function closeObservation() {
    setSuppressed(true);
    modalRoot.replaceChildren();
  }

  function isIntentionalObservationOpen(target) {
    return Boolean(target?.closest?.([
      "[data-admin-observe-launch]",
      "[data-admin-detail]",
      "[data-observe-jump]",
      "[data-observe-open-navigator]",
      "[data-observe-back]",
      "[data-observe-crumb-index]",
      "[data-observe-modal-tab]",
    ].join(",")));
  }

  if (descriptor?.get && descriptor?.set) {
    Object.defineProperty(modalRoot, "innerHTML", {
      configurable: true,
      enumerable: false,
      get() {
        return descriptor.get.call(modalRoot);
      },
      set(value) {
        if (suppressObservationRestore && isObservationMarkup(value)) return;
        descriptor.set.call(modalRoot, value);
      },
    });
  }

  window.addEventListener("click", (event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;

    if (isIntentionalObservationOpen(target)) {
      setSuppressed(false);
      return;
    }

    const closeButton = target.closest("[data-admin-modal-close]");
    const backdrop = target.matches("[data-admin-modal-backdrop]");
    if ((closeButton || backdrop) && modalRoot.querySelector(".admin-observe-modal")) {
      closeObservation();
    }
  }, true);

  window.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    if (!modalRoot.querySelector(".admin-observe-modal")) return;
    closeObservation();
  }, true);

  window.__BAEKJI_ADMIN_MODAL_REOPEN_GUARD__ = Object.freeze({
    closeObservation,
    isSuppressed: () => suppressObservationRestore,
    isObservationMarkup,
  });
})();
