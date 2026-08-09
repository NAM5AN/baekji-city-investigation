(() => {
  "use strict";

  if (window.__BAEKJI_TESTER_REGISTRY_GUARD__) return;

  const USER_KEY = "baekji_city_mvp_current_user_v034";
  const SESSION_PROFILE_KEY = "baekji_city_tester_session_profile_v1";
  const nativeDefineProperty = Object.defineProperty;
  const nativeObjectValues = Object.values;
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const DEMO_IDS = ["test_a", "test_b", "test_c"];
  const testerUsers = new Map();
  const sessionBridgeIds = new Set();
  let appRegistry = null;

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

  function safeSessionGet(key) {
    try { return sessionStorage.getItem(key); }
    catch { return null; }
  }

  function safeSessionSet(key, value) {
    try { sessionStorage.setItem(key, value); return true; }
    catch { return false; }
  }

  function safeSessionRemove(key) {
    try { sessionStorage.removeItem(key); }
    catch { /* sessionStorage unavailable */ }
  }

  function sessionSafeUser(user) {
    const id = String(user?.id || "");
    if (!UUID_RE.test(id)) return null;
    const name = String(user?.name || user?.loginId || "").trim();
    if (!name) return null;
    return {
      id,
      loginId: String(user?.loginId || name),
      name,
      password: "",
      initial: String(user?.initial || Array.from(name)[0] || "?"),
      note: String(user?.note || "초대 테스터 계정"),
      profilePhoto: String(user?.profilePhoto || ""),
      isTestOnly: true,
    };
  }

  function installSessionLookupBridge(user) {
    const id = String(user?.id || "");
    if (appRegistry || !UUID_RE.test(id) || sessionBridgeIds.has(id)) return false;
    const existing = Object.getOwnPropertyDescriptor(Object.prototype, id);
    if (existing && existing.configurable === false) return false;

    Reflect.defineProperty(Object.prototype, id, {
      configurable: true,
      enumerable: false,
      get() {
        return isDemoRegistry(this) ? testerUsers.get(id) : undefined;
      },
      set(value) {
        if (this === Object.prototype) return;
        Reflect.defineProperty(this, id, {
          configurable: true,
          enumerable: true,
          writable: true,
          value,
        });
      },
    });
    sessionBridgeIds.add(id);
    return true;
  }

  function cleanupSessionLookupBridges() {
    sessionBridgeIds.forEach((id) => {
      const descriptor = Object.getOwnPropertyDescriptor(Object.prototype, id);
      if (descriptor?.configurable) Reflect.deleteProperty(Object.prototype, id);
    });
    sessionBridgeIds.clear();
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
    cleanupSessionLookupBridges();
    Object.values = nativeObjectValues;
    return true;
  }

  function rememberCurrentTester() {
    const currentId = String(safeSessionGet(USER_KEY) || "");
    if (!UUID_RE.test(currentId)) return false;
    const user = testerUsers.get(currentId);
    const safeUser = sessionSafeUser(user);
    if (!safeUser) return false;
    safeSessionSet(SESSION_PROFILE_KEY, JSON.stringify(safeUser));
    if (!appRegistry) installSessionLookupBridge(safeUser);
    return true;
  }

  function restoreCurrentTester() {
    const currentId = String(safeSessionGet(USER_KEY) || "");
    if (!UUID_RE.test(currentId)) return false;
    let saved = null;
    try { saved = JSON.parse(safeSessionGet(SESSION_PROFILE_KEY) || "null"); }
    catch { saved = null; }
    const safeUser = sessionSafeUser(saved);
    if (!safeUser || safeUser.id !== currentId) return false;
    testerUsers.set(safeUser.id, safeUser);
    installSessionLookupBridge(safeUser);
    return true;
  }

  function registerTester(user) {
    const id = String(user?.id || "");
    if (!UUID_RE.test(id) || !user || typeof user !== "object") return false;
    testerUsers.set(id, user);
    syncRegistry();
    if (safeSessionGet(USER_KEY) === id) rememberCurrentTester();
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
      registerTester(user);
      return target;
    }

    return nativeDefineProperty(target, property, descriptor);
  };

  function captureRegistryValues(target) {
    if (!appRegistry && isDemoRegistry(target)) attachRegistry(target);
    return nativeObjectValues(target);
  }

  Object.values = captureRegistryValues;
  restoreCurrentTester();

  const api = Object.freeze({
    attachRegistry,
    registerTester,
    rememberCurrentTester,
    testerCount: () => testerUsers.size,
    hasTester: (id) => testerUsers.has(String(id)),
    registryAttached: () => Boolean(appRegistry),
    prototypeClean: (id) => !hasOwn(Object.prototype, String(id)),
    sessionProfileKey: SESSION_PROFILE_KEY,
  });
  window.__BAEKJI_TESTER_REGISTRY_GUARD__ = api;

  window.addEventListener?.("baekji-tester-fast-login", rememberCurrentTester);
  window.addEventListener?.("hashchange", () => {
    const currentId = String(safeSessionGet(USER_KEY) || "");
    if (UUID_RE.test(currentId)) {
      rememberCurrentTester();
      return;
    }
    safeSessionRemove(SESSION_PROFILE_KEY);
    cleanupSessionLookupBridges();
  });
})();
