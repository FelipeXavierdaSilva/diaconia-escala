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
const window = {
  localStorage: makeStorage(),
  sessionStorage: makeStorage(),
  location: { protocol: "http:", origin: "http://localhost", pathname: "/" },
  navigator: { userAgent: "test" },
  document: {
    body: { appendChild() {}, removeChild() {} },
    createElement: () => ({ href: "", download: "", click() {}, remove() {} }),
    getElementById: () => null,
  },
  URL: { createObjectURL: () => "blob:test", revokeObjectURL() {} },
  Blob: class Blob {
    constructor(parts) {
      this.parts = parts;
    }
  },
};
const sandbox = {
  window,
  document: window.document,
  navigator: window.navigator,
  location: window.location,
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
  setTimeout,
  clearTimeout,
  localStorage: window.localStorage,
  sessionStorage: window.sessionStorage,
  URL: window.URL,
  Blob: window.Blob,
};
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
for (const f of [
  "js/data/seed.js",
  "js/core/storage.js",
  "js/core/engine.js",
  "js/services/history.js",
  "js/services/backup-historico.js",
]) {
  vm.runInContext(fs.readFileSync(path.join(root, f), "utf8"), sandbox, { filename: f });
}

const Seed = sandbox.window.DiaconiaSeed;
const Bh = sandbox.window.DiaconiaBackupHistorico;
const Storage = sandbox.window.DiaconiaStorage;
const state = Seed.build();

assert("serviço existe", !!Bh);
assert("seed tem backupsHistorico", Array.isArray(state.backupsHistorico) && state.backupsHistorico.length === 0);
assert("LIMITE 15", Bh.LIMITE === 15);

const g1 = Bh.guardar(state, {
  motivo: "manual",
  observacao: "Teste inicial",
  usuarioId: "u_admin",
  usuarioNome: "Admin",
});
assert("guardar manual ok", g1.ok && state.backupsHistorico.length === 1);
assert("snapshot sem historico aninhado", !g1.item.dados.backupsHistorico);
assert("resumo tem escalas", g1.item.resumo.escalas > 0);

const qEscalasAntes = Object.keys(state.escalas || {}).length;
state.escalas = {};
assert("estado esvaziado", Object.keys(state.escalas).length === 0);

const id = g1.item.id;
const rest = Bh.restaurar(state, id, { usuarioId: "u_admin", usuarioNome: "Admin" });
assert("restaurar ok", rest.ok);
assert("escalas voltaram", Object.keys(state.escalas).length === qEscalasAntes);
assert(
  "cópia antes_restaurar criada",
  state.backupsHistorico.some((x) => x.motivo === "antes_restaurar")
);
assert("histórico preservado após restaurar", state.backupsHistorico.length >= 2);

const dl = Bh.downloadItem(state, id);
assert("download ok", dl.ok && dl.nome.includes("diaconia-backup"));

const ex = Bh.excluir(state, state.backupsHistorico[state.backupsHistorico.length - 1].id);
assert("excluir ok", ex.ok);

const local = Seed.build();
Bh.guardar(local, { motivo: "manual", usuarioId: "u1" });
const remote = Seed.build();
Bh.guardar(remote, { motivo: "exportacao", usuarioId: "u2" });
const idLocal = local.backupsHistorico[0].id;
const idRemote = remote.backupsHistorico[0].id;
assert("ids diferentes", idLocal !== idRemote);

const merged = Storage.mergeStates(local, remote);
assert("merge combina históricos", merged.backupsHistorico.length === 2);
assert(
  "merge tem ambos ids",
  merged.backupsHistorico.some((x) => x.id === idLocal) &&
    merged.backupsHistorico.some((x) => x.id === idRemote)
);

const fail = results.filter((r) => !r.ok);
for (const r of results) {
  console.log(`${r.ok ? "ok" : "FAIL"}  ${r.name}${r.detail && !r.ok ? " — " + r.detail : ""}`);
}
if (fail.length) {
  console.error(`\n${fail.length} falha(s)`);
  process.exit(1);
}
console.log(`\n${results.length} testes ok`);
