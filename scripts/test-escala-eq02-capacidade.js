/**
 * Capacidade: com acúmulo de funções, 8 ativos cobrem culto padrão (sem exigir 13 pessoas distintas).
 * Aconselhamento/Fechar precisam de casal — incluído no cenário.
 */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.join(__dirname, "..");
const results = [];

function assert(name, cond, detail = "") {
  results.push({ name, ok: !!cond, detail: detail || (cond ? "ok" : "falhou") });
}

const window = {
  localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
  sessionStorage: { getItem: () => null, setItem() {}, removeItem() {} },
};
const sandbox = {
  window,
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
};
sandbox.globalThis = sandbox;
vm.createContext(sandbox);

for (const f of ["js/data/seed.js", "js/core/calendar.js", "js/core/engine.js"]) {
  vm.runInContext(fs.readFileSync(path.join(root, f), "utf8"), sandbox, { filename: f });
}

const Seed = sandbox.window.DiaconiaSeed;
const Engine = sandbox.window.DiaconiaEngine;
const state = Seed.build();
const data = "2026-09-06";
const esc = state.escalas[data] || Seed.criarEscalaBase(data, "culto", "Culto", "18:00", ["eq02"]);
state.escalas[data] = esc;
assert("escala 06/09 existe", !!esc);
esc.equipesIds = ["eq02"];
esc.funcoesIds = [
  "lanche",
  "janta",
  "frente",
  "cadeiras",
  "gazofilacio",
  "contar_oferta",
  "louca",
  "intercessao",
  "seguranca",
  "aconselhamento",
  "fechar_templo",
];
esc.atribuicoes = {};
esc.problemas = [];

const nomes = [
  "David",
  "Kenia",
  "Naila",
  "Duda",
  "Luis Felipe",
  "Vinicius Oliveira",
  "Felipe",
  "Helenita",
  "Cabral",
  "Isadora",
];
const ativos = [true, true, true, true, true, true, true, true, false, false];
state.diaconos = nomes.map((nome, i) => ({
  id: `u${i}`,
  nome,
  equipeId: "eq02",
  ativo: ativos[i],
  funcoesPermitidas: ["*"],
}));
// Casal entre Felipe e Helenita (índices 6 e 7)
state.casais = [
  {
    id: "c_fh",
    diaconoIdA: "u6",
    diaconoIdB: "u7",
    preferirMesmoDia: true,
    preferirMesmaFuncao: false,
    naoServirJuntos: false,
    ativo: true,
  },
];

const membros = Engine.diaconosDaEquipe(state, "eq02");
assert("8 ativos na eq02", membros.length === 8, String(membros.length));

let slots = 0;
for (const fid of esc.funcoesIds) {
  slots += Engine.getFuncao(state, fid)?.qtdPorEquipe || 1;
}
assert("culto exige 15 vagas (com casais 2+2)", slots === 15, String(slots));

const result = Engine.gerarEquipe(state, JSON.parse(JSON.stringify(esc)), "eq02");
const filled = Object.values(result.atribuicoes).flat().length;
assert("com acúmulo preenche as 15 vagas", filled === 15, String(filled));
assert("sem problemas", result.problemas.length === 0, JSON.stringify(result.problemas));

const failed = results.filter((r) => !r.ok);
console.log(results.map((r) => `${r.ok ? "OK" : "FAIL"} ${r.name} — ${r.detail}`).join("\n"));
if (failed.length) {
  console.error(`\n${failed.length} falha(s)`);
  process.exit(1);
}
console.log("\nTodos os testes passaram.");
