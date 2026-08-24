/**
 * Teste do compartilhamento WhatsApp (wa.me direto + login/senha).
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

let lastOpenedUrl = null;
let clickCount = 0;

const document = {
  body: { appendChild() {}, removeChild() {} },
  createElement(tag) {
    if (tag === "a") {
      return {
        href: "",
        target: "",
        rel: "",
        click() {
          clickCount += 1;
          lastOpenedUrl = this.href;
        },
        remove() {},
      };
    }
    return {};
  },
  getElementById: () => null,
};

const window = {
  localStorage: makeStorage(),
  sessionStorage: makeStorage(),
  location: { origin: "https://test.local", pathname: "/", href: "" },
  document,
  navigator: {
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
    clipboard: { writeText: async () => {} },
  },
  open(url) {
    lastOpenedUrl = url;
    return null;
  },
};

const sandbox = {
  window,
  document,
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
};
sandbox.globalThis = sandbox;
vm.createContext(sandbox);

const files = [
  "js/data/seed.js",
  "js/core/calendar.js",
  "js/core/engine.js",
  "js/services/history.js",
  "js/services/whatsapp.js",
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

const WA = sandbox.window.DiaconiaWhatsApp;
const Seed = sandbox.window.DiaconiaSeed;
const state = Seed.build();

assert("DiaconiaWhatsApp existe", !!WA);

// Normalização de número BR
assert(
  "47997845287 → 5547997845287",
  WA.normalizarNumeroInternacional("47997845287") === "5547997845287"
);
assert(
  "5547997845287 mantém",
  WA.normalizarNumeroInternacional("5547997845287") === "5547997845287"
);
assert(
  "numeroValido 47997845287",
  WA.numeroValido("47997845287") === true
);
assert(
  "numeroValido incompleto rejeita",
  WA.numeroValido("479978") === false
);

// wa.me URL
const texto = "Login: teste\nSenha: 123";
const url = WA.waMeUrl("47997845287", texto);
assert("waMeUrl usa https://wa.me/", url.startsWith("https://wa.me/5547997845287"));
assert("waMeUrl inclui text=", url.includes("text="));
assert(
  "waMeUrl codifica mensagem",
  decodeURIComponent(url.split("text=")[1]).includes("Login: teste")
);

// abrirConversaWhatsapp (desktop simula click em <a>)
lastOpenedUrl = null;
clickCount = 0;
const ab = WA.abrirConversaWhatsapp("5547997845287", "Olá teste");
assert("abrirConversaWhatsapp ok", ab.ok === true);
assert("abrirConversaWhatsapp click", clickCount === 1);
assert(
  "abrirConversaWhatsapp URL correta",
  lastOpenedUrl === WA.waMeUrl("5547997845287", "Olá teste")
);

// compartilharCredenciais com abrirDireto (padrão) — abre wa.me
state.configuracoes.whatsapp = WA.cfgPadrao();
const usuario = {
  id: "u_test",
  nome: "Felipe Teste",
  login: "felipe",
  papel: "diacono",
  whatsapp: "47997845287",
  senha: "felipe123",
};
lastOpenedUrl = null;
clickCount = 0;
const share = WA.compartilharCredenciaisUsuario(state, usuario, { senha: "felipe123" });
assert("compartilharCredenciais ok", share.ok === true, share.erro || "");
assert("compartilharCredenciais manual_direto", share.via === "manual_direto", share.via || "");
assert("compartilharCredenciais abriu conversa", !!lastOpenedUrl?.includes("5547997845287"), lastOpenedUrl || "null");
if (lastOpenedUrl) {
  const msgDecoded = decodeURIComponent(lastOpenedUrl.split("text=")[1] || "");
  assert("mensagem contém login", msgDecoded.includes("felipe"));
  assert("mensagem contém senha", msgDecoded.includes("felipe123"));
}

// número editado no formulário (snapshot) sem salvar no state
const snapshotForm = { ...usuario, whatsapp: "11999990000" };
lastOpenedUrl = null;
clickCount = 0;
const shareForm = WA.compartilharCredenciaisUsuario(state, snapshotForm, { senha: "felipe123" });
assert("snapshot whatsapp ok", shareForm.ok === true);
assert(
  "snapshot usa número do formulário",
  lastOpenedUrl?.includes("5511999990000"),
  lastOpenedUrl || "null"
);

// compartilharCredenciais com painel (abrirDireto false)
state.configuracoes.whatsapp.abrirDireto = false;
sandbox.window.DiaconiaUI = {
  openModal(html) {
    sandbox._lastModal = html;
  },
  esc(s) {
    return String(s).replace(/&/g, "&amp;");
  },
  toast() {},
  closeModal() {},
};
lastOpenedUrl = null;
clickCount = 0;
const painel = WA.compartilharCredenciaisUsuario(state, usuario, { senha: "felipe123" });
assert("compartilhar painel ok", painel.ok === true);
assert("compartilhar painel via manual_painel", painel.via === "manual_painel");
assert("painel não abriu direto", clickCount === 0);
assert("painel modal aberto", typeof sandbox._lastModal === "string" && sandbox._lastModal.includes("wa-painel-texto"));

// Sem WhatsApp cadastrado
const semWa = WA.compartilharCredenciaisUsuario(
  state,
  { id: "x", nome: "Sem Num", login: "sem", senha: "123" },
  { senha: "123" }
);
assert("sem whatsapp falha", semWa.ok === false);
assert("sem whatsapp erro claro", (semWa.erro || "").includes("WhatsApp"));

const passed = results.filter((r) => r.ok).length;
const failed = results.filter((r) => !r.ok).length;

console.log(JSON.stringify({ total: results.length, passed, failed, results }, null, 2));
process.exit(failed ? 1 : 0);
