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
  "js/services/escala-arquivo.js",
]) {
  vm.runInContext(fs.readFileSync(path.join(root, f), "utf8"), sandbox, { filename: f });
}

const Seed = sandbox.window.DiaconiaSeed;
const Arq = sandbox.window.DiaconiaEscalaArquivo;
const state = Seed.build();
sandbox.window.DiaconiaAuth = { sessao: () => ({ usuarioId: "u_admin" }) };

assert("serviço existe", !!Arq);
assert("seed tem escalasArquivo", Array.isArray(state.escalasArquivo) && state.escalasArquivo.length === 0);

const datas = Object.keys(state.escalas || {}).sort();
assert("seed tem escalas", datas.length > 0, String(datas.length));

const data = datas[0];
const snapshot = JSON.parse(JSON.stringify(state.escalas[data]));
const sessao = { usuarioId: "u_admin" };

const vazio = Arq.guardarDatas(state, ["2099-01-01"], { motivo: "exclusao" });
assert("guardar datas inexistentes não cria item", vazio.vazio === true && state.escalasArquivo.length === 0);

const del = Arq.excluirDias(state, [data], sessao);
assert("excluir guarda cópia", del.ok && del.qtd === 1);
assert("dia saiu do calendário", !state.escalas[data]);
assert("arquivo tem 1 item", state.escalasArquivo.length === 1);
assert("motivo exclusão", state.escalasArquivo[0].motivo === "exclusao");
assert("cópia tem a escala", state.escalasArquivo[0].escalas[data]?.nome === snapshot.nome);

const id = state.escalasArquivo[0].id;
const rest = Arq.restaurar(state, id);
assert("restaurar sem conflito", rest.ok && rest.qtd === 1);
assert("dia voltou", !!state.escalas[data] && state.escalas[data].nome === snapshot.nome);

state.escalas[data].nome = "Alterada agora";
const rest2 = Arq.restaurar(state, id);
assert("restaurar com conflito pede confirmação", rest2.precisaConfirmar === true);
assert("sem sobrescrever não muda", state.escalas[data].nome === "Alterada agora");

const rest3 = Arq.restaurar(state, id, { sobrescrever: true });
assert("restaurar sobrescreve", rest3.ok && state.escalas[data].nome === snapshot.nome);
assert(
  "cópia antes de restaurar",
  state.escalasArquivo.some((x) => x.motivo === "antes_restaurar")
);

const periodo = Arq.datasPeriodo(2026, 8, 1);
assert("datasPeriodo agosto 2026", Array.isArray(periodo) && periodo.length >= 4, String(periodo.length));

const criar = Arq.guardar(state, {
  motivo: "criar",
  mensagem: "teste criar",
  usuarioId: "u_admin",
  escalas: { [data]: state.escalas[data] },
});
assert("guardar criar", criar.ok && criar.item.motivo === "criar");

const pdfMissing = Arq.gerarPdf(state, criar.item.id);
assert("pdf sem serviço retorna erro", pdfMissing.ok === false);

const fail = results.filter((r) => !r.ok);
for (const r of results) {
  console.log(`${r.ok ? "ok" : "FAIL"}  ${r.name}${r.detail && !r.ok ? " — " + r.detail : ""}`);
}
if (fail.length) {
  console.error(`\n${fail.length} falha(s)`);
  process.exit(1);
}
console.log(`\n${results.length} testes ok`);
