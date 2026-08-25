/**
 * Troca com várias funções: alerta (não aplica na hora) e permuta todas ao aceitar.
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

for (const f of [
  "js/data/seed.js",
  "js/core/calendar.js",
  "js/core/engine.js",
  "js/services/history.js",
  "js/services/swaps.js",
]) {
  vm.runInContext(fs.readFileSync(path.join(root, f), "utf8"), sandbox, { filename: f });
}

const Seed = sandbox.window.DiaconiaSeed;
const Engine = sandbox.window.DiaconiaEngine;
const Swaps = sandbox.window.DiaconiaSwaps;

const state = Seed.build();
if (state.configuracoes?.whatsapp) state.configuracoes.whatsapp.ativo = false;

const data = Object.keys(state.escalas).sort()[0];
const eqId = (state.escalas[data].equipesIds || [])[0];
const fids = state.escalas[data].funcoesIds || state.funcoesPadraoCulto || [];
assert("há data e equipe", !!data && !!eqId && fids.length >= 3, `${data} ${eqId} ${fids.length}`);

const ativos = Engine.diaconosDaEquipe(state, eqId).filter((d) => d.ativo !== false);
const a = ativos[0];
const b = ativos[1];
assert("dois diáconos", !!(a && b && a.id !== b.id));

const fid1 = fids[0];
const fid2 = fids[1];
const fid3 = fids[2];

const esc = state.escalas[data];
esc.equipesIds = [eqId];
esc.atribuicoes = { [eqId]: { [fid1]: [a.id], [fid2]: [a.id], [fid3]: [b.id] } };
esc.funcoesIds = fids;
assert("escala montada direto", esc.atribuicoes[eqId][fid1].includes(a.id));

const slotsAAntes = Swaps.slotsDoDiaconoNaEscala(state.escalas[data], a.id);
const slotsBAntes = Swaps.slotsDoDiaconoNaEscala(state.escalas[data], b.id);
assert("A tem 2 funções", slotsAAntes.length >= 2, String(slotsAAntes.length));
assert("B tem 1 função", slotsBAntes.length === 1, String(slotsBAntes.length));

const userA = state.usuarios.find((u) => u.diaconoId === a.id) || { id: "ua", diaconoId: a.id };
const userB = state.usuarios.find((u) => u.diaconoId === b.id) || { id: "ub", diaconoId: b.id };
if (!state.usuarios.some((u) => u.diaconoId === a.id)) state.usuarios.push({ id: "ua", diaconoId: a.id, nome: a.nome });
if (!state.usuarios.some((u) => u.diaconoId === b.id)) state.usuarios.push({ id: "ub", diaconoId: b.id, nome: b.nome });

const sessaoA = { usuarioId: userA.id, nome: a.nome, diaconoId: a.id };
const sessaoB = { usuarioId: userB.id, nome: b.nome, diaconoId: b.id };

const snapAntes = JSON.stringify(state.escalas[data].atribuicoes);
const sol = Swaps.solicitar(
  state,
  {
    data,
    equipeId: eqId,
    funcaoId: fid1,
    paraDiaconoId: b.id,
    modalidade: "troca",
    deDiaconoId: a.id,
  },
  sessaoA
);

assert("solicitar troca multi ok", sol.ok === true, sol.erro || "");
assert("marca multifuncao", sol.troca?.multifuncao === true);
assert("não aplica na hora", sol.troca?.escalaAplicada !== true);
assert("escala intacta até o aceite", JSON.stringify(state.escalas[data].atribuicoes) === snapAntes);
assert("avisou os dois", (state.notificacoes || []).filter((n) => n.meta?.trocaId === sol.troca.id).length >= 2);

const resumo = Swaps.resumoTrocaMultifuncao(state, sol.troca);
assert("resumo envolve várias", resumo.envolve === true);
assert("nomes origem tem 2+", resumo.nomesOrigem.length >= 2, String(resumo.nomesOrigem));

const ace = Swaps.aceitar(state, sol.troca.id, sessaoB);
assert("aceitar ok", ace.ok === true, ace.erro || "");
assert("status aprovada", sol.troca.status === "aprovada");
assert("aplicou na escala", sol.troca.escalaAplicada === true);

const slotsADepois = Swaps.slotsDoDiaconoNaEscala(state.escalas[data], a.id);
const slotsBDepois = Swaps.slotsDoDiaconoNaEscala(state.escalas[data], b.id);
const fidsA = slotsADepois.map((s) => s.funcaoId).sort();
const fidsB = slotsBDepois.map((s) => s.funcaoId).sort();
assert("A ficou com a função de B", fidsA.join() === fid3, fidsA.join());
assert("B ficou com as 2 de A", fidsB.join() === [fid1, fid2].sort().join(), fidsB.join());

const failed = results.filter((x) => !x.ok);
console.log(results.map((x) => `${x.ok ? "OK" : "FAIL"} ${x.name} — ${x.detail}`).join("\n"));
if (failed.length) {
  console.error(`\n${failed.length} falha(s)`);
  process.exit(1);
}
console.log("\nTodos os testes passaram.");
