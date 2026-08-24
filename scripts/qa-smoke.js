/**
 * Smoke tests headless (Node) — carrega módulos via vm + window fake.
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

const files = [
  "js/data/seed.js",
  "js/core/calendar.js",
  "js/core/engine.js",
  "js/core/storage.js",
  "js/core/auth.js",
  "js/services/history.js",
  "js/services/restrictions.js",
  "js/services/swaps.js",
];

for (const f of files) {
  const code = fs.readFileSync(path.join(root, f), "utf8");
  try {
    vm.runInContext(code, sandbox, { filename: f });
    assert(`load ${f}`, true);
  } catch (e) {
    assert(`load ${f}`, false, e.message);
  }
}

const Seed = sandbox.window.DiaconiaSeed;
const Engine = sandbox.window.DiaconiaEngine;
const Cal = sandbox.window.DiaconiaCalendar;
const Storage = sandbox.window.DiaconiaStorage;
const Auth = sandbox.window.DiaconiaAuth;
const Rest = sandbox.window.DiaconiaRestrictions;
const Swaps = sandbox.window.DiaconiaSwaps;

assert("seed.build", typeof Seed?.build === "function");
const state = Seed.build();
assert("seed diaconos", (state.diaconos || []).length >= 10, `n=${state.diaconos?.length}`);
assert("seed equipes", (state.equipes || []).length >= 2);
assert("seed escalas agosto", Object.keys(state.escalas || {}).filter((d) => d.startsWith("2026-08")).length >= 4);

const datas = Object.keys(state.escalas).sort();
const d0 = datas[0];
const esc0 = state.escalas[d0];
assert("1 equipe por dia (seed)", (esc0.equipesIds || []).length === 1, JSON.stringify(esc0.equipesIds));

const stVazio = Engine.statusEscala({ data: "2099-01-01", equipesIds: [], atribuicoes: {}, problemas: [] }, state);
assert("equipesIds vazio → rascunho", stVazio === "rascunho", `status=${stVazio}`);

assert("labelStatus afetada existe", Engine.labelStatus("afetada").texto === "Afetada");
assert(
  "statusEscala retorna afetada com alerta",
  Engine.statusEscala({ ...esc0, alertaAfetacao: { x: 1 }, problemas: [] }, state) === "afetada",
  `got=${Engine.statusEscala({ ...esc0, alertaAfetacao: { x: 1 }, problemas: [] }, state)}`
);

const eqId = esc0.equipesIds[0];
Engine.gerarEscalaData(state, d0, { equipesIds: [eqId] });
const afterGen = state.escalas[d0];
assert("gerarEscalaData preenche", Object.values(afterGen.atribuicoes?.[eqId] || {}).some((a) => a.length), "sem atribuições");

const diac = Engine.diaconosDaEquipe(state, eqId)[0];
assert("diacono da equipe", !!diac);
const funcoes = afterGen.funcoesIds || state.funcoesPadraoCulto;
const atrDup = {};
for (const fid of funcoes) atrDup[fid] = [];
atrDup[funcoes[0]] = [diac.id];
atrDup[funcoes[1]] = [diac.id];
const man = Engine.salvarEscalaManual(state, d0, eqId, atrDup);
assert("manual: mesma pessoa em 2 funções OK", man.ok === true, man.erro || "");

const manDupSlot = Engine.salvarEscalaManual(state, d0, eqId, {
  ...Object.fromEntries(funcoes.map((f) => [f, []])),
  [funcoes.find((f) => (Engine.getFuncao(state, f)?.qtdPorEquipe || 1) >= 2) || funcoes[0]]: [diac.id, diac.id],
});
const fid2 = funcoes.find((f) => (Engine.getFuncao(state, f)?.qtdPorEquipe || 1) >= 2);
if (fid2) {
  assert("manual: duplicata na mesma função bloqueada", manDupSlot.ok === false, manDupSlot.erro || "deveria falhar");
} else {
  assert("manual: duplicata mesma função (skip sem qtd>=2)", true, "sem função com 2 vagas");
}

// Contar oferta qtd
const of = state.funcoes.find((f) => /oferta/i.test(f.nome) || f.id === "contar_oferta" || f.id === "oferta");
if (of) {
  assert("Contar oferta qtd vs instrução", of.qtdPorEquipe >= 2 || !/duas|2 /i.test(of.instrucoes || ""), `qtd=${of.qtdPorEquipe}`);
}

// Auth
const sessaoFake = { usuarioId: "u_admin", nome: "Admin", papel: "lider", diaconoId: null };
try {
  const login = Auth.login("admin", "admin123", state);
  assert("login admin", login.ok === true);
} catch (e) {
  assert("login admin", false, e.message);
}
assert("senha em claro no state", state.usuarios.some((u) => typeof u.senha === "string" && u.senha.length > 0));

// Storage migrate wipe check (migrate via save)
const dirty = JSON.parse(JSON.stringify(state));
dirty.meta.modeloEquipePorDia = false;
dirty.escalas[d0].equipesIds = ["eq01", "eq02"];
dirty.escalas[d0].atribuicoes = { eq01: { [funcoes[0]]: [diac.id] } };
try {
  Storage.save(dirty);
  const reloaded = Storage.load();
  const atr = reloaded.escalas[d0].atribuicoes || {};
  const kept = atr.eq01?.[funcoes[0]]?.includes(diac.id);
  assert(
    "migração preserva equipe com atribuições",
    reloaded.escalas[d0].equipesIds?.length === 1 && kept,
    JSON.stringify(reloaded.escalas[d0])
  );
} catch (e) {
  assert("migração preserva equipe com atribuições", false, e.message);
}

// Restrição → afetada
Engine.gerarEscalaData(state, d0, { equipesIds: [eqId] });
const afterGen2 = state.escalas[d0];
const alvo = Object.entries(afterGen2.atribuicoes?.[eqId] || {}).find(([, ids]) => ids?.length);
if (alvo) {
  const [, ids] = alvo;
  Rest.criar(
    state,
    {
      diaconoId: ids[0],
      data: d0,
      tipo: "indisponivel",
      observacao: "teste QA",
      status: "aprovada",
    },
    sessaoFake
  );
  const escA = state.escalas[d0];
  assert(
    "aprovação cria alertaAfetacao",
    !!escA.alertaAfetacao || escA.status === "afetada",
    `status=${escA.status} alerta=${!!escA.alertaAfetacao}`
  );
  const listSt = Engine.statusEscala(escA, state);
  assert("lista mostra afetada via statusEscala", listSt === "afetada", `listSt=${listSt}`);
} else {
  assert("aprovação cria alertaAfetacao", false, "sem atribuição para testar");
}

// Troca/cobertura: aceite aplica na escala sem aprovação da liderança
const swapsSrc = fs.readFileSync(path.join(root, "js/services/swaps.js"), "utf8");
assert(
  "aceitar aplica escala sem aguardar líder",
  swapsSrc.includes("aceitar") &&
    swapsSrc.includes("aplicarNaEscala") &&
    !swapsSrc.includes("exigirAprovacaoTroca")
);

// Previsão anual
const anoTest = 2027;
const antes = Object.keys(state.escalas).filter((d) => d.startsWith("2027")).length;
const gerAno = Engine.gerarAno(state, anoTest);
assert("gerarAno cria escalas", gerAno.datas >= 50 && gerAno.criadas > 0, JSON.stringify(gerAno));
assert(
  "gerarAno preenche atribuições",
  Object.keys(state.escalas).filter((d) => d.startsWith("2027")).length > antes,
  `antes=${antes}`
);

// Overwrite guard exists in views
const liderSrc = fs.readFileSync(path.join(root, "js/ui/views-lider.js"), "utf8");
assert(
  "nova escala bloqueia data duplicada",
  liderSrc.includes("Já existe escala nesta data"),
  "guard ausente"
);
assert("CRUD usuários presente", liderSrc.includes("formUsuario") && liderSrc.includes("btn-add-u"));
assert("histórico excluir presente", liderSrc.includes("del-h") && liderSrc.includes("btn-clear-hist"));
assert("líderes add/del presente", liderSrc.includes("btn-add-lider") && liderSrc.includes("del-lider"));

const failed = results.filter((r) => !r.ok);
const passed = results.filter((r) => r.ok);
console.log(JSON.stringify({ total: results.length, passed: passed.length, failed: failed.length, results }, null, 2));
process.exit(failed.length ? 1 : 0);
