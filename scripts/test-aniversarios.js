const fs = require("fs");
const path = require("path");
const vm = require("vm");
const root = path.join(__dirname, "..");
const results = [];
function assert(name, cond, detail = "") {
  results.push({ name, ok: !!cond, detail: detail || (cond ? "ok" : "falhou") });
}

const sandbox = {
  window: {},
  console,
  Date,
  Math,
  JSON,
  Object,
  String,
  Number,
  Array,
};
sandbox.globalThis = sandbox;
vm.createContext(sandbox);

for (const f of [
  "js/data/seed.js",
  "js/core/calendar.js",
  "js/core/engine.js",
  "js/services/history.js",
  "js/services/aniversarios.js",
]) {
  vm.runInContext(fs.readFileSync(path.join(root, f), "utf8"), sandbox, { filename: f });
}

const Aniv = sandbox.window.DiaconiaAniversarios;
const state = sandbox.window.DiaconiaSeed.build();
const hoje = sandbox.window.DiaconiaCalendar.hojeISO();

assert("serviço existe", !!Aniv);
assert("cfg padrão", Aniv.ensureCfg(state).avisarLider === true);

const d = state.diaconos[0];
d.dataNascimento = hoje.replace(/^\d{4}/, "1990");
d.casado = true;
d.conjugeNome = "Cônjuge Teste";
d.conjugeDataNascimento = hoje.replace(/^\d{4}/, "1992");
d.temFilhos = true;
d.filhos = [{ nome: "Filho Teste", dataNascimento: hoje.replace(/^\d{4}/, "2015") }];

const info = Aniv.coletarAniversariosHoje(state);
assert("diácono hoje", info.diaconos.length === 1);
assert("família hoje", info.familia.length === 2);

state.configuracoes.aniversarios.publicarParaEquipe = true;
state.meta.aniversariosProcessadosEm = "";
const sync = Aniv.sincronizar(state);
assert("sync dirty", sync.dirty === true);
assert("comunicado tarja", (state.comunicados || []).some((c) => c.id === `aniv_auto_${hoje}` && c.ativo));
assert("notificação líder", (state.notificacoes || []).some((n) => n.meta?.tipo === "aniversario"));

const txt = (state.comunicados.find((c) => c.id === `aniv_auto_${hoje}`) || {}).texto || "";
assert("tarja só diácono", txt.includes(d.nome) && !txt.includes("Cônjuge") && !txt.includes("Filho"));

const fail = results.filter((r) => !r.ok);
for (const r of results) console.log(r.ok ? "ok" : "FAIL", r.name, r.detail && !r.ok ? r.detail : "");
if (fail.length) process.exit(1);
console.log(`\n${results.length} testes ok`);
