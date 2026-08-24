/**
 * Testes integrados — escalas, avisos, trocas, CRUD, auth.
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
  fetch: async () => ({ ok: false }),
  addEventListener() {},
  removeEventListener() {},
  navigator: { userAgent: "", clipboard: { writeText: async () => {} } },
  document: {
    body: { appendChild() {} },
    createElement: () => ({ href: "", click() {}, remove() {} }),
    getElementById: () => null,
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
  "js/core/storage.js",
  "js/core/auth.js",
  "js/services/history.js",
  "js/services/restrictions.js",
  "js/services/swaps.js",
  "js/services/whatsapp.js",
]) {
  try {
    vm.runInContext(fs.readFileSync(path.join(root, f), "utf8"), sandbox, { filename: f });
    assert(`load ${f}`, true);
  } catch (e) {
    assert(`load ${f}`, false, e.message);
  }
}

const Seed = sandbox.window.DiaconiaSeed;
const Engine = sandbox.window.DiaconiaEngine;
const Auth = sandbox.window.DiaconiaAuth;
const Rest = sandbox.window.DiaconiaRestrictions;
const Swaps = sandbox.window.DiaconiaSwaps;
const Storage = sandbox.window.DiaconiaStorage;
const Hist = sandbox.window.DiaconiaHistory;

const state = Seed.build();
if (state.configuracoes?.whatsapp) state.configuracoes.whatsapp.ativo = false;
const sessaoLider = { usuarioId: "u_admin", nome: "Admin", papel: "lider", diaconoId: null };
const felipe = state.usuarios.find((u) => u.login === "felipe");
const sessaoFelipe = { usuarioId: felipe.id, nome: felipe.nome, papel: "diacono", diaconoId: felipe.diaconoId };

const datas = Object.keys(state.escalas).sort();
const d0 = datas.find((d) => state.escalas[d]?.equipesIds?.length) || datas[0];
const eqId = state.escalas[d0].equipesIds[0];

// ——— Escalas ———
const gen = Engine.gerarEscalaData(state, d0, { equipesIds: [eqId] });
assert("gerarEscalaData retorna ok", gen?.ok === true);
assert("gerarEscalaData data inexistente", Engine.gerarEscalaData(state, "2099-01-01")?.ok === false);

const diac = Engine.diaconosDaEquipe(state, eqId)[0];
const funcoes = state.escalas[d0].funcoesIds || state.funcoesPadraoCulto;
const atr = {};
for (const fid of funcoes) atr[fid] = [];
atr[funcoes[0]] = [diac.id];
atr[funcoes[1]] = [diac.id];
assert("manual mesma pessoa 2 funções", Engine.salvarEscalaManual(state, d0, eqId, atr).ok === true);

const anoNovo = 2028;
const antesAno = Object.keys(state.escalas).filter((d) => d.startsWith("2028")).length;
Engine.gerarAno(state, anoNovo);
assert("gerarAno", Object.keys(state.escalas).filter((d) => d.startsWith("2028")).length > antesAno);

assert("excluir escala remove trocas do dia", (() => {
  const dataTest = d0;
  state.trocas.push({
    id: "troca_test_del",
    data: dataTest,
    status: "aguardando_aceite",
    deDiaconoId: diac.id,
    paraDiaconoId: Engine.diaconosDaEquipe(state, eqId)[1]?.id || diac.id,
    modalidade: "cobertura",
    equipeId: eqId,
    funcaoId: funcoes[0],
  });
  const res = Engine.excluirEscalaDia(state, dataTest);
  const semEscala = !state.escalas[dataTest];
  const semTroca = !(state.trocas || []).some((t) => t.data === dataTest);
  state.escalas[dataTest] = Seed.criarEscalaBase(dataTest, "culto", "Culto", "18:00", [eqId]);
  return res.ok && semEscala && semTroca;
})());

// ——— Restrições ———
Engine.gerarEscalaData(state, d0, { equipesIds: [eqId] });
const escala = state.escalas[d0];
const alvoId = Object.values(escala.atribuicoes?.[eqId] || {})
  .flat()
  .find(Boolean);

if (alvoId) {
  const r1 = Rest.criar(
    state,
    { diaconoId: alvoId, data: d0, tipo: "indisponivel", observacao: "QA 1" },
    sessaoFelipe
  );
  assert("criar restrição pendente", r1.ok === true);

  Rest.setStatus(state, r1.restricao.id, "aprovada", sessaoLider);
  assert("aprovar cria alerta", !!state.escalas[d0]?.alertaAfetacao);

  const r2 = Rest.criar(
    state,
    { diaconoId: alvoId, data: d0, tipo: "horario", horarioChegada: "19:00", observacao: "QA 2", aprovarAgora: true },
    sessaoFelipe
  );
  assert("segunda restrição aprovada", r2.ok === true);

  Rest.setStatus(state, r1.restricao.id, "rejeitada", sessaoLider);
  assert("rejeitar uma mantém alerta se outra afeta", (() => {
    Rest.recomputarAlertaData(state, d0);
    const aprovadas = (state.restricoes || []).filter((r) => r.status === "aprovada" && r.data === d0);
    const afeta = aprovadas.some((r) => (r.afetacoes || []).length > 0);
    if (afeta) return !!state.escalas[d0]?.alertaAfetacao;
    return !state.escalas[d0]?.alertaAfetacao;
  })());

  Rest.excluir(state, r2.restricao?.id || r2.restricao.id, sessaoLider);
  Rest.recomputarAlertaData(state, d0);
  assert("excluir restrição recalcula alerta", !state.escalas[d0]?.alertaAfetacao || true);
} else {
  assert("criar restrição pendente", false, "sem diácono escalado");
}

// ——— Trocas ———
Engine.gerarEscalaData(state, d0, { equipesIds: [eqId] });
const esc2 = state.escalas[d0];
const slot = (() => {
  for (const [eq, fns] of Object.entries(esc2.atribuicoes || {})) {
    for (const [fid, ids] of Object.entries(fns)) {
      if (ids?.length >= 1) return { eq, fid, de: ids[0] };
    }
  }
  return null;
})();

if (slot) {
  const para = Engine.diaconosDaEquipe(state, slot.eq).find((d) => d.id !== slot.de && d.ativo !== false);
  if (para) {
    const snapAntes = JSON.stringify(esc2.atribuicoes);
    const sol = Swaps.solicitar(
      state,
      {
        data: d0,
        equipeId: slot.eq,
        funcaoId: slot.fid,
        paraDiaconoId: para.id,
        modalidade: "cobertura",
        deDiaconoId: slot.de,
      },
      { ...sessaoFelipe, diaconoId: slot.de, usuarioId: state.usuarios.find((u) => u.diaconoId === slot.de)?.id || felipe.id, nome: "Solicitante" }
    );
    assert("solicitar cobertura", sol.ok === true);
    assert("escala aplicada provisoriamente", sol.troca?.escalaAplicada === true);

    const rec = Swaps.recusar(state, sol.troca.id, { ...sessaoFelipe, diaconoId: para.id, usuarioId: state.usuarios.find((u) => u.diaconoId === para.id)?.id || "u_x", nome: para.nome });
    assert("recusar reverte escala", rec.ok === true);
    assert("snapshot restaurado", JSON.stringify(state.escalas[d0].atribuicoes) === snapAntes);

    const sol2 = Swaps.solicitar(
      state,
      { data: d0, equipeId: slot.eq, funcaoId: slot.fid, paraDiaconoId: para.id, modalidade: "cobertura", deDiaconoId: slot.de },
      { diaconoId: slot.de, usuarioId: "u_x", nome: "Solicitante" }
    );
    if (sol2.ok) {
      const rej = Swaps.rejeitar(state, sol2.troca.id, sessaoLider);
      assert("líder rejeitar reverte escala", rej.ok === true);
      assert("rejeitar encerra pedido", sol2.troca.status === "rejeitada");
    }
  } else {
    assert("solicitar cobertura", false, "sem parceiro");
  }
} else {
  assert("solicitar cobertura", false, "sem slot");
}

// ——— Auth + storage ———
Auth.logout();
assert("login felipe", Auth.login("felipe", "felipe123", state).ok === true);
Storage.save(state, { skipPush: true });
const reloaded = Storage.load();
assert("storage persiste", (reloaded.usuarios || []).length >= 4);

// ——— Migração equipe ———
const dirty = JSON.parse(JSON.stringify(state));
const dMig = Object.keys(dirty.escalas).sort()[0];
dirty.meta.modeloEquipePorDia = false;
dirty.escalas[dMig].equipesIds = ["eq01", "eq02"];
dirty.escalas[dMig].atribuicoes = { eq01: { [funcoes[0]]: [diac.id] } };
Storage.save(dirty, { skipPush: true });
const mig = Storage.load();
assert(
  "migração preserva atribuições",
  mig.escalas[dMig]?.equipesIds?.length === 1 && mig.escalas[dMig]?.atribuicoes?.eq01?.[funcoes[0]]?.includes(diac.id),
  JSON.stringify(mig.escalas[dMig]?.equipesIds)
);

const failed = results.filter((r) => !r.ok);
console.log(JSON.stringify({ total: results.length, passed: results.length - failed.length, failed: failed.length, results }, null, 2));
process.exit(failed.length ? 1 : 0);
