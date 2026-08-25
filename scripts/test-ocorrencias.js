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
};
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
for (const f of [
  "js/data/seed.js",
  "js/core/calendar.js",
  "js/core/engine.js",
  "js/services/history.js",
  "js/services/ocorrencias.js",
]) {
  vm.runInContext(fs.readFileSync(path.join(root, f), "utf8"), sandbox, { filename: f });
}

const Seed = sandbox.window.DiaconiaSeed;
const Ocr = sandbox.window.DiaconiaOcorrencias;
const state = Seed.build();
const data =
  Object.values(state.escalas || {})
    .map((e) => e.data)
    .filter(Boolean)
    .sort()
    .pop() || "2026-08-24";

const relator = { usuarioId: "u_felipe", nome: "Felipe", papel: "diacono", diaconoId: "d01" };
const outro = { usuarioId: "u_outro", nome: "Outro", papel: "diacono", diaconoId: "d02" };
const admin = { usuarioId: "u_admin", nome: "Admin", papel: "lider", diaconoId: null };

assert("serviço existe", !!Ocr);

const priv = Ocr.criar(
  state,
  { data, tipo: "incidente", titulo: "Portão emperrado", descricao: "Não abriu na entrada do culto.", visibilidade: "privada" },
  relator
);
assert("criar privada ok", priv.ok === true, priv.erro || "");
assert("visibilidade privada", priv.ocorrencia.visibilidade === "privada");
assert("status registrada", priv.ocorrencia.status === "registrada");

assert("admin vê privada", Ocr.podeVer(priv.ocorrencia, admin));
assert("relator vê privada", Ocr.podeVer(priv.ocorrencia, relator));
assert("outro NÃO vê privada", !Ocr.podeVer(priv.ocorrencia, outro));

const listaOutro = Ocr.listar(state, { sessao: outro });
assert("lista outro sem privada", !listaOutro.some((o) => o.id === priv.ocorrencia.id));

const listaAdmin = Ocr.listar(state, { sessao: admin });
assert("lista admin tem privada", listaAdmin.some((o) => o.id === priv.ocorrencia.id));

const pub = Ocr.criar(
  state,
  {
    data,
    tipo: "ausencia",
    titulo: "Falta no portão",
    descricao: "Diácono avisou em cima da hora.",
    visibilidade: "equipe",
  },
  relator
);
assert("criar equipe ok", pub.ok === true, pub.erro || "");
assert("outro vê equipe", Ocr.podeVer(pub.ocorrencia, outro));

Ocr.marcarVisualizacao(state, pub.ocorrencia.id, outro);
const notifAntes = (state.notificacoes || []).filter((n) => n.usuarioId === outro.usuarioId).length;

const upd = Ocr.atualizar(
  state,
  pub.ocorrencia.id,
  { status: "em_providencia", providencia: "Já cobrimos com o José." },
  admin
);
assert("admin atualiza status", upd.ok === true, upd.erro || "");
assert("status em providência", upd.ocorrencia.status === "em_providencia");
assert("providencia salva", upd.ocorrencia.providencia.includes("José"));

const notifDepois = (state.notificacoes || []).filter((n) => n.usuarioId === outro.usuarioId);
assert(
  "quem visualizou foi notificado",
  notifDepois.length > notifAntes,
  `antes=${notifAntes} depois=${notifDepois.length}`
);

const legacy = {
  id: "ocr_legacy",
  data,
  titulo: "Antiga",
  descricao: "teste legado",
  status: "vista",
  criadoPor: relator.usuarioId,
};
state.ocorrencias.push(legacy);
Ocr.ensure(state);
assert("migra vista→em_providencia", legacy.status === "em_providencia");

assert("relator oculto para outro", Ocr.nomeRelatorPara(pub.ocorrencia, outro) === "Um diácono");
assert("relator visível para admin", Ocr.nomeRelatorPara(pub.ocorrencia, admin) === "Felipe");
assert("relator visível para si", Ocr.nomeRelatorPara(priv.ocorrencia, relator) === "Felipe");
assert("providência oculta por padrão", Ocr.podeVerProvidencia(pub.ocorrencia, outro) === false);
assert("relator vê medidas da própria ocorrência", Ocr.podeVerProvidencia(pub.ocorrencia, relator) === true);

const jaResolvida = Ocr.criar(
  state,
  {
    data,
    tipo: "material",
    titulo: "Cadeira quebrada",
    descricao: "Cadeira da fila da frente quebrou na entrada.",
    providencia: "Retiramos a cadeira e isolamos o espaço.",
    resolvida: true,
  },
  relator
);
assert("diácono registra já resolvida", jaResolvida.ok === true, jaResolvida.erro || "");
assert("status resolvida no relato", jaResolvida.ocorrencia.status === "resolvida");
assert("medidas salvas no relato", jaResolvida.ocorrencia.providencia.includes("Retiramos"));

const resv = Ocr.atualizar(
  state,
  pub.ocorrencia.id,
  { status: "resolvida", providencia: "Portão lubrificado.", exporProvidencia: true },
  admin
);
assert("resolver ok", resv.ok === true, resv.erro || "");
assert("status resolvida", resv.ocorrencia.status === "resolvida");
assert("expor providência", resv.ocorrencia.exporProvidencia === true);
assert("relator vê o que foi feito", Ocr.podeVerProvidencia(resv.ocorrencia, relator) === true);
assert("quem viu vê o que foi feito", Ocr.podeVerProvidencia(resv.ocorrencia, outro) === true);

const mostrar = Ocr.atualizar(state, pub.ocorrencia.id, { ocultarRelator: false }, admin);
assert("admin pode expor relator", mostrar.ok && mostrar.ocorrencia.ocultarRelator === false);
assert("outro passa a ver o nome", Ocr.nomeRelatorPara(pub.ocorrencia, outro) === "Felipe");

const failed = results.filter((r) => !r.ok);
for (const r of results) console.log(`${r.ok ? "OK" : "FAIL"}  ${r.name}${r.detail && !r.ok ? " — " + r.detail : ""}`);
console.log(`\n${results.length - failed.length}/${results.length} ok`);
process.exit(failed.length ? 1 : 0);
