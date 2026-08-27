/**
 * Teste: salvar Minha conta grava diácono + usuário e persiste no storage.
 */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.join(__dirname, "..");
const results = [];

function assert(name, cond, detail = "") {
  results.push({ name, ok: !!cond, detail: detail || (cond ? "ok" : "falhou") });
}

function makeStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
  };
}

let remoteState = null;
const window = {
  localStorage: makeStorage(),
  sessionStorage: makeStorage(),
  location: { protocol: "http:", origin: "http://localhost", pathname: "/" },
  navigator: { userAgent: "test", clipboard: { writeText: async () => {} } },
  document: {
    body: { appendChild() {} },
    createElement: () => ({ href: "", click() {}, remove() {} }),
    getElementById: () => null,
  },
  addEventListener() {},
  removeEventListener() {},
  fetch: async (url, opts) => {
    if (url === "/api/state" && opts?.method === "PUT") {
      const body = JSON.parse(opts.body);
      remoteState = body.state;
      return {
        ok: true,
        json: async () => ({ ok: true, state: remoteState, merged: true }),
      };
    }
    return { ok: false };
  },
};

const sandbox = {
  window,
  document: window.document,
  navigator: window.navigator,
  console,
  Date,
  Math,
  JSON,
  Array,
  Object,
  String,
  Number,
  Boolean,
  Set,
  Map,
  RegExp,
  Error,
  parseInt,
  parseFloat,
  isNaN,
  Infinity,
  undefined,
  localStorage: window.localStorage,
  sessionStorage: window.sessionStorage,
  fetch: window.fetch,
  setTimeout,
  clearTimeout,
};
sandbox.globalThis = sandbox;
vm.createContext(sandbox);

for (const f of [
  "js/data/seed.js",
  "js/core/calendar.js",
  "js/core/engine.js",
  "js/services/whatsapp.js",
  "js/core/storage.js",
  "js/ui/helpers.js",
]) {
  vm.runInContext(fs.readFileSync(path.join(root, f), "utf8"), sandbox, { filename: f });
}

const UI = sandbox.window.DiaconiaUI;
const Storage = sandbox.window.DiaconiaStorage;
const state = sandbox.window.DiaconiaSeed.build();

const diacono = state.diaconos.find((d) => d.nome === "Felipe") || state.diaconos[0];
const usuario = state.usuarios.find((u) => u.diaconoId === diacono.id) || state.usuarios[0];
assert("seed tem diácono", !!diacono);
assert("seed tem usuário", !!usuario);

const dados = {
  nome: "Felipe Teste Conta",
  whatsapp: "5547997845287",
  ministerioId: (state.ministerios || [])[0]?.id || "",
  funcaoMinisterio: "Back vocal",
  casado: false,
  conjugeNome: "",
  conjugeMembroIgreja: false,
  restricaoPessoal: "Observação de teste",
  temFilhos: false,
  qtdFilhos: 0,
  filhos: [],
  filhosVaoIgreja: false,
};

UI.aplicarDadosPessoais(diacono, dados);
usuario.nome = dados.nome;
usuario.whatsapp = dados.whatsapp;

Storage.save(state);
const loaded = Storage.load();
const d2 = loaded.diaconos.find((x) => x.id === diacono.id);
const u2 = loaded.usuarios.find((x) => x.id === usuario.id);

assert("localStorage: nome diácono", d2?.nome === dados.nome, d2?.nome);
assert("localStorage: whatsapp", d2?.whatsapp === dados.whatsapp, d2?.whatsapp);
assert("localStorage: ministério id", d2?.ministerioId === dados.ministerioId, d2?.ministerioId);
assert("localStorage: função ministério", d2?.funcaoMinisterio === dados.funcaoMinisterio, d2?.funcaoMinisterio);
assert("localStorage: restrição pessoal", d2?.restricaoPessoal === dados.restricaoPessoal, d2?.restricaoPessoal);
assert("localStorage: usuário nome", u2?.nome === dados.nome, u2?.nome);

(async () => {
  const sync = await Storage.saveAndSync(state);
  assert("saveAndSync ok", sync?.ok === true, JSON.stringify(sync));
  assert("servidor recebeu estado", !!remoteState);
  const dr = remoteState.diaconos.find((x) => x.id === diacono.id);
  assert("remoto: nome diácono", dr?.nome === dados.nome, dr?.nome);
  assert("remoto: restrição", dr?.restricaoPessoal === dados.restricaoPessoal, dr?.restricaoPessoal);

  const failed = results.filter((r) => !r.ok);
  for (const r of results) {
    console.log(r.ok ? "✓" : "✗", r.name, r.detail ? `— ${r.detail}` : "");
  }
  if (failed.length) {
    console.error(`\n${failed.length} falha(s).`);
    process.exit(1);
  }
  console.log(`\n${results.length} testes OK — Minha conta grava local + sync.`);
})();
