(() => {
  "use strict";

  if (window.__BAEKJI_TESTER_REGISTRY_GUARD__) return;

  const nativeDefineProperty = Object.defineProperty;
  const nativeObjectValues = Object.values;
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const DEMO_IDS = ["test_a", "test_b", "test_c"];
  const testerUsers = new Map();
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

  function registerTester(user) {
    const id = String(user?.id || "");
    if (!UUID_RE.test(id) || !user || typeof user !== "object") return false;
    testerUsers.set(id, user);
    syncRegistry();
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

  const api = Object.freeze({
    attachRegistry,
    registerTester,
    testerCount: () => testerUsers.size,
    hasTester: (id) => testerUsers.has(String(id)),
    registryAttached: () => Boolean(appRegistry),
    prototypeClean: (id) => !hasOwn(Object.prototype, String(id)),
  });
  window.__BAEKJI_TESTER_REGISTRY_GUARD__ = api;
})();
