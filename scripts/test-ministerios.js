/**
 * Ministérios: catálogo + conflito de horário na geração.
 */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.join(__dirname, "..");
const results = [];

function assert(name, cond, detail = "") {
  results.push({ name, ok: !!cond, detail: detail || (cond ? "ok" : "falhou") });
}

const windowObj = {
  localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
  sessionStorage: { getItem: () => null, setItem() {}, removeItem() {} },
  location: { protocol: "http:", origin: "http://localhost", pathname: "/" },
};
const sandbox = {
  window: windowObj,
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
  localStorage: windowObj.localStorage,
  sessionStorage: windowObj.sessionStorage,
};
sandbox.globalThis = sandbox;
vm.createContext(sandbox);

for (const f of ["js/data/seed.js", "js/core/calendar.js", "js/core/engine.js"]) {
  vm.runInContext(fs.readFileSync(path.join(root, f), "utf8"), sandbox, { filename: f });
}

const Seed = sandbox.window.DiaconiaSeed;
const Engine = sandbox.window.DiaconiaEngine;
const Cal = sandbox.window.DiaconiaCalendar;

assert("conflito 19h em 18-21", Cal.horarioConflitaComJanela("19:00", "18:00", "21:00") === true);
assert("café 17:30 ok", Cal.horarioConflitaComJanela("17:30", "18:00", "21:00") === false);
assert("Final ok", Cal.horarioConflitaComJanela("Final", "18:00", "21:00") === false);
assert("exato no fim ok", Cal.horarioConflitaComJanela("21:00", "18:00", "21:00") === false);

const state = Seed.build();
assert("seed tem ministerios", (state.ministerios || []).length >= 1);

// Migração mínima (como storage)
if (!Array.isArray(state.ministerios)) state.ministerios = [];
for (const d of state.diaconos || []) {
  if (d.ministerioId === undefined) d.ministerioId = "";
}
assert("diaconos têm ministerioId", state.diaconos.every((d) => d.ministerioId !== undefined));

const d = state.diaconos.find((x) => x.id === "d01");
d.ministerioId = "min_infantil";
const fLouca = Engine.getFuncao(state, "louca"); // 18:00
const fLanche = Engine.getFuncao(state, "lanche"); // 17:30
const fFechar = Engine.getFuncao(state, "fechar_templo"); // Final

assert("conflito louça", Engine.conflitoHorarioMinisterio(state, d, fLouca) === true);
assert("lanche ok", Engine.conflitoHorarioMinisterio(state, d, fLanche) === false);
assert("fechar ok", Engine.conflitoHorarioMinisterio(state, d, fFechar) === false);

assert(
  "candidatoValido bloqueia louça",
  Engine.candidatoValido(state, d, "2026-09-06", "louca", new Set()) === false
);
assert(
  "candidatoValido permite lanche",
  Engine.candidatoValido(state, d, "2026-09-06", "lanche", new Set()) === true
);

const failed = results.filter((r) => !r.ok);
console.log(results.map((r) => `${r.ok ? "OK" : "FAIL"} ${r.name} — ${r.detail}`).join("\n"));
if (failed.length) {
  console.error(`\n${failed.length} falha(s)`);
  process.exit(1);
}
console.log("\nTodos os testes passaram.");
