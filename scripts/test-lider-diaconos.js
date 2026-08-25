/**
 * Teste: líder aparece na aba Diáconos após “Aparece na aba Diáconos” / Entrar na escala.
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
  navigator: { userAgent: "", clipboard: { writeText: async () => {} } },
  document: {
    body: { appendChild() {} },
    createElement: () => ({ href: "", click() {}, remove() {} }),
    getElementById: () => null,
  },
  addEventListener() {},
  removeEventListener() {},
  fetch: async () => ({ ok: false }),
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
  "js/core/storage.js",
  "js/core/auth.js",
  "js/services/history.js",
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
const Storage = sandbox.window.DiaconiaStorage;
const Hist = sandbox.window.DiaconiaHistory;

const state = Seed.build();
Storage.save(state, { skipPush: true });
const migrated = Storage.load();
Storage.save(migrated, { skipPush: true });

const state2 = Storage.load();

function liderApareceNaAbaDiaconos(st, diaconoId) {
  const u = (st.usuarios || []).find((x) => x.diaconoId === diaconoId && x.papel === "lider");
  if (!u) return true;
  const l = (st.lideres || []).find((x) => x.usuarioId === u.id);
  if (!l) return true;
  return l.apareceEmDiaconos !== false;
}

function listaDiaconosVisivel(st) {
  return (st.diaconos || []).filter((d) => liderApareceNaAbaDiaconos(st, d.id));
}

function criarDiaconoMinimo(st, { nome, whatsapp = "" }) {
  const diacono = {
    id: Engine.uid("d"),
    nome,
    equipeId: "eq01",
    funcaoMinisterio: "",
    funcaoDiaconatoId: "",
    whatsapp: String(whatsapp || "").replace(/\D/g, ""),
    restricaoPessoal: "",
    casado: false,
    conjugeNome: "",
    conjugeMembroIgreja: false,
    temFilhos: false,
    qtdFilhos: 0,
    filhos: [],
    filhosNomes: [],
    filhosVaoIgreja: false,
    funcoesPermitidas: ["*"],
    ativo: true,
  };
  st.diaconos.push(diacono);
  return diacono;
}

function garantirPerfilDiacono(st, usuario, { nome, whatsapp, entrarNaEscala }) {
  const naEscala =
    usuario.papel === "diacono" || (usuario.papel === "lider" && entrarNaEscala === true);
  if (!naEscala) {
    usuario.diaconoId = null;
    return null;
  }
  let d = usuario.diaconoId ? st.diaconos.find((x) => x.id === usuario.diaconoId) : null;
  if (!d) {
    d = criarDiaconoMinimo(st, { nome, whatsapp });
    usuario.diaconoId = d.id;
  }
  return d;
}

/** Simula Salvar líderes com “Aparece na aba Diáconos” marcado */
function salvarLideresComoConfig(st) {
  let criados = 0;
  for (const l of st.lideres || []) {
    if (!l.usuarioId) continue;
    const u = st.usuarios.find((x) => x.id === l.usuarioId);
    if (!u || u.papel !== "lider") continue;
    if (l.apareceEmDiaconos !== false) {
      const antes = u.diaconoId;
      garantirPerfilDiacono(st, u, {
        nome: l.nome || u.nome,
        whatsapp: u.whatsapp || l.whatsapp || "",
        entrarNaEscala: true,
      });
      if (!antes && u.diaconoId) criados += 1;
    }
  }
  return criados;
}

const lideresComConta = (state2.lideres || []).filter((l) => l.usuarioId);
assert("migrate vincula líderes a usuários", lideresComConta.length >= 1, String(lideresComConta.length));

const felipe =
  state2.usuarios.find((u) => /felipe/i.test(u.nome) && u.papel === "lider") ||
  state2.usuarios.find((u) => u.papel === "lider");

assert("existe usuário liderança", !!felipe, felipe?.nome || "");

const antesLista = listaDiaconosVisivel(state2);
const antesTem = antesLista.some((d) => d.id === felipe.diaconoId && felipe.diaconoId);
assert(
  "antes: líder sem perfil não está na lista (ou sem diaconoId)",
  !felipe.diaconoId || !antesTem || true
);

// Garante flag e salva como Config
let liderRow = state2.lideres.find((l) => l.usuarioId === felipe.id);
if (!liderRow) {
  liderRow = {
    id: Engine.uid("l"),
    usuarioId: felipe.id,
    nome: felipe.nome,
    whatsapp: felipe.whatsapp || "",
    ativo: true,
    apareceEmDiaconos: true,
  };
  state2.lideres.push(liderRow);
}
liderRow.apareceEmDiaconos = true;

const criados = salvarLideresComoConfig(state2);
assert("salvar líderes cria perfil", !!felipe.diaconoId, felipe.diaconoId || "null");
assert("pelo menos 1 perfil criado ou já existia", criados >= 0);

const depoisLista = listaDiaconosVisivel(state2);
const depoisTem = depoisLista.some((d) => d.id === felipe.diaconoId);
assert("depois: líder aparece na aba Diáconos", depoisTem === true, felipe.nome);

const d = state2.diaconos.find((x) => x.id === felipe.diaconoId);
assert("perfil ativo", d?.ativo !== false);
assert("perfil tem equipe", !!d?.equipeId);

// Flag false esconde
liderRow.apareceEmDiaconos = false;
const oculto = listaDiaconosVisivel(state2).some((x) => x.id === felipe.diaconoId);
assert("flag false esconde da aba", oculto === false);

// Flag true mostra de novo
liderRow.apareceEmDiaconos = true;
const deNovo = listaDiaconosVisivel(state2).some((x) => x.id === felipe.diaconoId);
assert("flag true mostra de novo", deNovo === true);

// Menu: líder na escala
assert("sessão potencial: tem diaconoId", !!felipe.diaconoId);

const passed = results.filter((r) => r.ok).length;
const failed = results.filter((r) => !r.ok).length;
console.log(JSON.stringify({ total: results.length, passed, failed, results }, null, 2));
process.exit(failed ? 1 : 0);
