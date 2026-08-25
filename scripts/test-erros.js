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
  URL: { createObjectURL: () => "blob:x", revokeObjectURL() {} },
  Blob: class {
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
  URL: window.URL,
  Blob: window.Blob,
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
};
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
for (const f of [
  "js/data/seed.js",
  "js/core/calendar.js",
  "js/core/engine.js",
  "js/services/history.js",
  "js/services/errors.js",
]) {
  vm.runInContext(fs.readFileSync(path.join(root, f), "utf8"), sandbox, { filename: f });
}
const Seed = sandbox.window.DiaconiaSeed;
const Err = sandbox.window.DiaconiaErrors;
const state = Seed.build();
const sessao = { usuarioId: "u_felipe", nome: "Felipe", papel: "diacono", diaconoId: "d01" };
const admin = { usuarioId: "u_admin", nome: "Admin", papel: "lider", diaconoId: null };

assert("serviço existe", !!Err);
const c = Err.criar(state, { titulo: "Bug teste", descricao: "Não salvou a viagem ao clicar", area: "escala" }, sessao);
assert("criar ok", c.ok === true, c.erro || "");
assert("lista tem 1", (state.relatosErro || []).length === 1);
assert("status aberto", c.relato.status === "aberto");
assert("notificou líderes", (state.notificacoes || []).some((n) => n.meta?.tipo === "relato_erro"));

const up = Err.atualizarStatus(state, c.relato.id, { status: "resolvido", notaAdmin: "Corrigido" }, admin);
assert("resolver ok", up.ok && up.relato.status === "resolvido");
assert("resumo", Err.resumo(state).porStatus.resolvido === 1);

const txt = Err.gerarRelatorioTexto(state);
assert("relatório contém título", txt.includes("Bug teste"));
assert("relatório contém Felipe", txt.includes("Felipe"));

const failed = results.filter((r) => !r.ok);
console.log(JSON.stringify({ total: results.length, passed: results.length - failed.length, failed: failed.length, results }, null, 2));
process.exit(failed.length ? 1 : 0);
