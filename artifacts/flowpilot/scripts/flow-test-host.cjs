const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

function loadSource(file, mocks = {}, globals = {}) {
  const compiled = ts.transpileModule(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX,
      target: ts.ScriptTarget.ES2020, esModuleInterop: true },
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(compiled, { ...globals, exports: module.exports, module, require: (name) => {
    if (name in mocks) return mocks[name];
    if (name === 'react/jsx-runtime') {
      const jsx = (type, props) => ({ type, props });
      return { jsx, jsxs: jsx, Fragment: 'Fragment' };
    }
    if (name === '@/lib/task-utils') return loadSource('lib/task-utils.ts');
    throw new Error(`Missing test mock: ${name}`);
  } });
  return module.exports;
}

function host(storage, { mocks = {}, globals = {} } = {}) {
  const state = [], deps = [];
  let cursor = 0, effectCursor = 0, effects = [];
  const react = {
    createContext: () => ({ Provider: 'Provider' }),
    useState: (initial) => {
      const index = cursor++;
      if (!(index in state)) state[index] = typeof initial === 'function' ? initial() : initial;
      return [state[index], (value) => { state[index] = typeof value === 'function' ? value(state[index]) : value; }];
    },
    useEffect: (callback, nextDeps) => {
      const index = effectCursor++;
      if (!deps[index] || nextDeps.some((value, i) => value !== deps[index][i])) effects.push(callback);
      deps[index] = nextDeps;
    },
    useMemo: (callback) => callback(),
  };
  const { FlowProvider } = loadSource('context/FlowContext.tsx', {
    react,
    'react-native': { AppState: { addEventListener: () => ({ remove() {} }) } },
    '@react-native-async-storage/async-storage': {
      getItem: async () => storage.value ?? null,
      setItem: async (key, value) => { assert.equal(key, 'flowpilot-state-v1'); storage.value = value; },
    },
    '@/lib/notifications': { scheduleProjectReminders: async () => true },
    ...mocks,
  }, { setTimeout: () => 0, clearTimeout: () => {}, ...globals });
  return async () => {
    let value;
    for (let pass = 0; pass < 3; pass++) {
      cursor = 0; effectCursor = 0; effects = [];
      value = FlowProvider({ children: null }).props.value;
      effects.forEach((effect) => effect());
      await new Promise(setImmediate);
    }
    return value;
  };
}

const plain = (value) => JSON.parse(JSON.stringify(value));
module.exports = { host, plain, loadSource };
