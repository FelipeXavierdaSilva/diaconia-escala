/**
 * Teste: viagem (período) bloqueia geração da escala.
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

const window = {
  localStorage: makeStorage(),
  sessionStorage: makeStorage(),
  location: { protocol: "http:", origin: "http://localhost", pathname: "/" },
  navigator: { userAgent: "" },
  document: { body: { appendChild() {} }, createElement: () => ({ click() {}, remove() {} }), getElementById: () => null },
  fetch: async () => ({ ok: false }),
  addEventListener() {},
  removeEventListener() {},
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
  setTimeout,
  clearTimeout,
  localStorage: window.localStorage,
  sessionStorage: window.sessionStorage,
  fetch: window.fetch,
};
sandbox.globalThis = sandbox;
vm.createContext(sandbox);

for (const f of [
  "js/data/seed.js",
  "js/core/calendar.js",
  "js/core/engine.js",
  "js/core/auth.js",
  "js/services/history.js",
  "js/services/restrictions.js",
]) {
  vm.runInContext(fs.readFileSync(path.join(root, f), "utf8"), sandbox, { filename: f });
}

const Seed = sandbox.window.DiaconiaSeed;
const Engine = sandbox.window.DiaconiaEngine;
const Cal = sandbox.window.DiaconiaCalendar;
const Rest = sandbox.window.DiaconiaRestrictions;

const state = Seed.build();
if (state.configuracoes?.whatsapp) state.configuracoes.whatsapp.ativo = false;

assert("fimPorQtdDias 3 dias", Cal.fimPorQtdDias("2026-10-10", 3) === "2026-10-12");
assert("datasEntre", Cal.datasEntre("2026-10-10", "2026-10-12").join(",") === "2026-10-10,2026-10-11,2026-10-12");

const sessao = { usuarioId: "u_felipe", nome: "Felipe", diaconoId: "d01", papel: "diacono" };
const viagem = Rest.criarViagem(
  state,
  { data: "2026-10-10", qtdDias: 5, motivoViagem: "trabalho" },
  sessao
);

assert("criarViagem ok", viagem.ok === true, viagem.erro || "");
assert("status aprovada", viagem.restricao?.status === "aprovada");
assert("dataFim", viagem.restricao?.dataFim === "2026-10-14");
assert("motivoViagem", viagem.restricao?.motivoViagem === "trabalho");

assert("bloqueia dia 10", Engine.podeParticipar(state, "d01", "2026-10-10") === false);
assert("bloqueia dia 12", Engine.podeParticipar(state, "d01", "2026-10-12") === false);
assert("bloqueia dia 14", Engine.podeParticipar(state, "d01", "2026-10-14") === false);
assert("libera dia 15", Engine.podeParticipar(state, "d01", "2026-10-15") === true);
assert("libera dia 09", Engine.podeParticipar(state, "d01", "2026-10-09") === true);

const familiar = Rest.criarViagem(
  state,
  { data: "2026-11-01", qtdDias: 1, motivoViagem: "familiar" },
  sessao
);
assert("viagem familiar 1 dia", familiar.ok && familiar.restricao?.dataFim == null);
assert("bloqueia 01/11", Engine.podeParticipar(state, "d01", "2026-11-01") === false);

const failed = results.filter((r) => !r.ok);
console.log(JSON.stringify({ total: results.length, passed: results.length - failed.length, failed: failed.length, results }, null, 2));
process.exit(failed.length ? 1 : 0);
