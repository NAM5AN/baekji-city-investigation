(() => {
  "use strict";

  if (window.__BAEKJI_TESTER_REGISTRY_GUARD__) return;

  const nativeDefineProperty = Object.defineProperty;
  const nativeObjectValues = Object.values;
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const DEMO_IDS = ["test_a", "test_b", "test_c"];
  const testerUsers = new Map();
  let appRegistry = null;
  let captureTimer = 0;
  let captureStartedAt = Date.now();

  function hasOwn(target, key) {
    return Object.prototype.hasOwnProperty.call(target, key);
  }

  function isDemoRegistry(target) {
    if (!target || typeof target !== "object") return false;
    return DEMO_IDS.every((id) => {
      if (!hasOwn(target, id)) return false;
      const user = target[id];
      return user && typeof user.loginId === "string" && typeof user.password === "string";
    });
  }

  function syncRegistry() {
    if (!appRegistry) return;
    testerUsers.forEach((user, id) => {
      nativeDefineProperty(appRegistry, id, {
        configurable: true,
        enumerable: true,
        writable: true,
        value: user,
      });
    });
  }

  function attachRegistry(target) {
    if (!isDemoRegistry(target)) return false;
    appRegistry = target;
    syncRegistry();
    Object.values = nativeObjectValues;
    return true;
  }

  function fakeDemoRegistry() {
    return {
      test_a: { id: "test_a", loginId: "캐릭터A", password: "1234" },
      test_b: { id: "test_b", loginId: "캐릭터B", password: "1234" },
      test_c: { id: "test_c", loginId: "캐릭터C", password: "1234" },
    };
  }

  Object.defineProperty = function guardedDefineProperty(target, property, descriptor) {
    const id = String(property || "");
    const isTesterBridge = target === Object.prototype
      && UUID_RE.test(id)
      && descriptor?.configurable === true
      && descriptor?.enumerable === false
      && typeof descriptor?.get === "function"
      && typeof descriptor?.set === "function";

    if (!isTesterBridge) return nativeDefineProperty(target, property, descriptor);

    let user = null;
    try {
      user = descriptor.get.call(fakeDemoRegistry());
    } catch {
      user = null;
    }

    if (user?.isTestOnly && String(user.id) === id) {
      testerUsers.set(id, user);
      syncRegistry();
      return target;
    }

    return nativeDefineProperty(target, property, descriptor);
  };

  function clearProbeUI(form, idInput, passwordInput, previous) {
    if (idInput) idInput.value = previous.id;
    if (passwordInput) passwordInput.value = previous.password;
    const error = form?.querySelector?.("[data-login-error]");
    if (error?.textContent === "아이디 또는 비밀번호가 일치하지 않습니다.") error.textContent = "";
  }

  function tryCaptureRegistry() {
    if (appRegistry) return;
    const form = document.querySelector?.("[data-login-form]");
    const idInput = form?.querySelector?.("[data-login-id]");
    const passwordInput = form?.querySelector?.("[data-login-password]");

    if (!form || !idInput || !passwordInput) {
      if (Date.now() - captureStartedAt < 8000) captureTimer = setTimeout(tryCaptureRegistry, 30);
      return;
    }

    const previousValues = Object.values;
    if (previousValues === nativeObjectValues) {
      if (Date.now() - captureStartedAt < 8000) captureTimer = setTimeout(tryCaptureRegistry, 30);
      return;
    }

    Object.values = function captureDemoRegistry(target) {
      if (isDemoRegistry(target)) {
        attachRegistry(target);
        return nativeObjectValues(target);
      }
      return previousValues(target);
    };

    const previous = { id: idInput.value, password: passwordInput.value };
    idInput.value = "__registry_probe__";
    passwordInput.value = "";
    try {
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    } catch {
      // 다음 재시도에서 다시 캡처합니다.
    } finally {
      clearProbeUI(form, idInput, passwordInput, previous);
    }

    if (!appRegistry && Date.now() - captureStartedAt < 8000) {
      Object.values = previousValues;
      captureTimer = setTimeout(tryCaptureRegistry, 30);
      return;
    }

    if (appRegistry) {
      Object.values = nativeObjectValues;
      const currentId = sessionStorage.getItem("baekji_city_mvp_current_user_v034");
      if (currentId && testerUsers.has(currentId)) {
        queueMicrotask(() => window.dispatchEvent(new Event("hashchange")));
      }
    }
  }

  const api = Object.freeze({
    attachRegistry,
    testerCount: () => testerUsers.size,
    hasTester: (id) => testerUsers.has(String(id)),
    registryAttached: () => Boolean(appRegistry),
    prototypeClean: (id) => !hasOwn(Object.prototype, String(id)),
  });
  window.__BAEKJI_TESTER_REGISTRY_GUARD__ = api;

  captureTimer = setTimeout(tryCaptureRegistry, 0);
})();
