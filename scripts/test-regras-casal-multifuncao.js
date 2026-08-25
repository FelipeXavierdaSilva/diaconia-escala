/**
 * Regras: multi-função, casal obrigatório, não servir juntos, recorrência.
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
const Cal = sandbox.window.DiaconiaCalendar;

const state = Seed.build();
const data = "2026-09-06"; // 1º domingo de setembro 2026
assert("06/09/2026 é 1º domingo", Cal.indiceDomingoNoMes(data) === 1, String(Cal.indiceDomingoNoMes(data)));

const mesa = state.funcoes.find((f) => f.id === "mesa_ceia");
assert("mesa_ceia recorrência 1º domingo", mesa?.recorrencia === "primeiro_domingo");
assert("mesa_ceia encaixa no 1º domingo", Cal.funcaoEncaixaNaData(mesa, data) === true);
assert(
  "mesa_ceia não encaixa no 2º domingo",
  Cal.funcaoEncaixaNaData(mesa, "2026-09-13") === false
);

const fids1 = Engine.funcoesParaData(state, data);
assert("funcoesParaData inclui mesa_ceia no 1º", fids1.includes("mesa_ceia"));
const fids2 = Engine.funcoesParaData(state, "2026-09-13");
assert("funcoesParaData exclui mesa_ceia no 2º", !fids2.includes("mesa_ceia"));

assert("fechar qtd 2", state.funcoes.find((f) => f.id === "fechar_templo")?.qtdPorEquipe === 2);
assert("aconselhamento qtd 2", state.funcoes.find((f) => f.id === "aconselhamento")?.qtdPorEquipe === 2);

// Equipe com 8 ativos + 1 casal que pode servir juntos + funções padrão
state.diaconos = [];
for (let i = 0; i < 8; i++) {
  state.diaconos.push({
    id: `u${i}`,
    nome: `P${i}`,
    equipeId: "eq02",
    ativo: true,
    funcoesPermitidas: ["*"],
  });
}
// Casal que serve junto (para aconselhamento/fechar)
state.diaconos.push(
  { id: "ca", nome: "CasalA", equipeId: "eq02", ativo: true, funcoesPermitidas: ["*"] },
  { id: "cb", nome: "CasalB", equipeId: "eq02", ativo: true, funcoesPermitidas: ["*"] }
);
state.casais = [
  {
    id: "cj1",
    diaconoIdA: "ca",
    diaconoIdB: "cb",
    preferirMesmoDia: true,
    preferirMesmaFuncao: false,
    naoServirJuntos: false,
    ativo: true,
  },
];

const esc = state.escalas[data] || Seed.criarEscalaBase(data, "culto", "Culto", "18:00", ["eq02"]);
state.escalas[data] = esc;
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

const r = Engine.gerarEquipe(state, JSON.parse(JSON.stringify(esc)), "eq02");
const filled = Object.values(r.atribuicoes).flat().length;
assert("com acúmulo preenche a maioria", filled >= 13, String(filled));
assert(
  "aconselhamento é casal",
  Engine.parCasalValido(state, r.atribuicoes.aconselhamento?.[0], r.atribuicoes.aconselhamento?.[1]),
  JSON.stringify(r.atribuicoes.aconselhamento)
);
assert(
  "fechar é casal",
  Engine.parCasalValido(state, r.atribuicoes.fechar_templo?.[0], r.atribuicoes.fechar_templo?.[1]),
  JSON.stringify(r.atribuicoes.fechar_templo)
);
assert("fechar tem 2", (r.atribuicoes.fechar_templo || []).length === 2);

// Casal que NÃO pode servir junto
state.casais = [
  {
    id: "cj2",
    diaconoIdA: "u0",
    diaconoIdB: "u1",
    preferirMesmoDia: false,
    preferirMesmaFuncao: false,
    naoServirJuntos: true,
    ativo: true,
  },
  {
    id: "cj1",
    diaconoIdA: "ca",
    diaconoIdB: "cb",
    preferirMesmoDia: true,
    preferirMesmaFuncao: false,
    naoServirJuntos: false,
    ativo: true,
  },
];
const r2 = Engine.gerarEquipe(state, JSON.parse(JSON.stringify(esc)), "eq02");
const noDia = new Set(Object.values(r2.atribuicoes).flat());
assert(
  "não servir juntos: u0 e u1 não no mesmo culto juntos OU só um",
  !(noDia.has("u0") && noDia.has("u1")),
  `u0=${noDia.has("u0")} u1=${noDia.has("u1")}`
);
assert(
  "parCasalValido rejeita casal naoServirJuntos",
  Engine.parCasalValido(state, "u0", "u1") === false
);

// Manual rejeita solteiros em fechar
const man = Engine.salvarEscalaManual(state, data, "eq02", {
  ...Object.fromEntries(esc.funcoesIds.map((f) => [f, []])),
  fechar_templo: ["u2", "u3"],
  aconselhamento: ["ca", "cb"],
});
assert("manual rejeita solteiros em fechar", man.ok === false, man.erro || "");

const manOk = Engine.salvarEscalaManual(state, data, "eq02", {
  ...Object.fromEntries(esc.funcoesIds.map((f) => [f, []])),
  fechar_templo: ["ca", "cb"],
  aconselhamento: ["ca", "cb"],
  lanche: ["u2"],
});
assert("manual aceita casal + multi-função", manOk.ok === true, manOk.erro || "");

const manNao = Engine.salvarEscalaManual(state, data, "eq02", {
  ...Object.fromEntries(esc.funcoesIds.map((f) => [f, []])),
  lanche: ["u0"],
  janta: ["u1"],
});
assert("manual rejeita casal naoServirJuntos no mesmo culto", manNao.ok === false, manNao.erro || "");

// Desmarcar função no dia
const upd = Engine.atualizarEscalaDia(state, data, {
  equipeId: "eq02",
  funcoesIds: esc.funcoesIds.filter((id) => id !== "lanche"),
});
assert("atualizar funcoesIds ok", upd.ok === true && upd.funcoesMudou === true);
assert("lanche removido", !state.escalas[data].funcoesIds.includes("lanche"));

const failed = results.filter((x) => !x.ok);
console.log(results.map((x) => `${x.ok ? "OK" : "FAIL"} ${x.name} — ${x.detail}`).join("\n"));
if (failed.length) {
  console.error(`\n${failed.length} falha(s)`);
  process.exit(1);
}
console.log("\nTodos os testes passaram.");
