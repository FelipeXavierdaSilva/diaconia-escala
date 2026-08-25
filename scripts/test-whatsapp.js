/**
 * Teste do WhatsApp: número BR (zero + DD) e link direto da conversa.
 */
const fs = require("fs");
const path = require("path");
const https = require("https");
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
    return { closed: false };
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

assert(
  "047997845287 → 5547997845287",
  WA.normalizarNumeroInternacional("047997845287") === "5547997845287"
);
assert(
  "47997845287 → 5547997845287",
  WA.normalizarNumeroInternacional("47997845287") === "5547997845287"
);
assert(
  "5547997845287 mantém",
  WA.normalizarNumeroInternacional("5547997845287") === "5547997845287"
);
assert(
  "047 99784-5287 → 5547997845287",
  WA.normalizarNumeroInternacional("047 99784-5287") === "5547997845287"
);
assert(
  "55047997845287 → 5547997845287",
  WA.normalizarNumeroInternacional("55047997845287") === "5547997845287"
);
assert("numeroValido 047997845287", WA.numeroValido("047997845287") === true);
assert("numeroValido 479978", WA.numeroValido("479978") === false);

const texto = "Login: teste\nSenha: 123";
const urlMe = WA.waMeUrl("047997845287", texto);
assert(
  "waMeUrl abre conversa (api.whatsapp.com/send)",
  urlMe.startsWith("https://api.whatsapp.com/send/?")
);
assert("waMeUrl phone=5547997845287", urlMe.includes("phone=5547997845287"));
assert("waMeUrl não usa 047", !urlMe.includes("047997845287"));
assert("waMeUrl type=phone_number", urlMe.includes("type=phone_number"));
assert("waMeUrl app_absent=0", urlMe.includes("app_absent=0"));
assert("waMeUrl inclui texto", decodeURIComponent(urlMe).includes("Login: teste"));

const urlWeb = WA.waWebUrl("047997845287", texto);
assert(
  "waWebUrl usa web.whatsapp.com/send",
  urlWeb.startsWith("https://web.whatsapp.com/send/?")
);
assert("waWebUrl phone=5547997845287", urlWeb.includes("phone=5547997845287"));
assert("waWebUrl type=phone_number", urlWeb.includes("type=phone_number"));

lastOpenedUrl = null;
clickCount = 0;
const ab = WA.abrirWhatsAppApp("047997845287", "Olá teste");
assert("abrirWhatsAppApp ok", ab.ok === true);
assert("abrirWhatsAppApp numero normalizado", ab.numero === "5547997845287");
assert(
  "abrirWhatsAppApp URL da conversa",
  lastOpenedUrl === WA.waMeUrl("047997845287", "Olá teste"),
  lastOpenedUrl || "null"
);

lastOpenedUrl = null;
const web = WA.abrirWhatsAppWeb("047997845287", "Olá teste");
assert("abrirWhatsAppWeb ok", web.ok === true);
assert(
  "abrirWhatsAppWeb URL da conversa",
  lastOpenedUrl === WA.waWebUrl("047997845287", "Olá teste"),
  lastOpenedUrl || "null"
);

const usuario = {
  id: "u_test",
  nome: "Felipe Teste",
  login: "felipexavier",
  papel: "lider",
  whatsapp: "047997845287",
  senha: "felipe123",
};

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
state.configuracoes.whatsapp = WA.cfgPadrao();
lastOpenedUrl = null;
clickCount = 0;
const share = WA.compartilharCredenciaisUsuario(state, usuario, { senha: "felipe123" });
assert("compartilharCredenciais ok", share.ok === true, share.erro || "");
assert("compartilharCredenciais abre painel no PC", share.via === "manual_painel", share.via || "");
assert(
  "painel mostra 5547997845287",
  typeof sandbox._lastModal === "string" && sandbox._lastModal.includes("5547997845287")
);
assert(
  "painel não mostra 047 como destino",
  typeof sandbox._lastModal === "string" && !sandbox._lastModal.includes("047997845287")
);

const dest = WA.numeroDeUsuario(state, usuario);
assert("numeroDeUsuario ok com 047", dest.ok === true, dest.erro || "");
assert("numeroDeUsuario = 5547997845287", dest.numero === "5547997845287");

const semWa = WA.compartilharCredenciaisUsuario(
  state,
  { id: "x", nome: "Sem Num", login: "sem", senha: "123" },
  { senha: "123" }
);
assert("sem whatsapp falha", semWa.ok === false);

// Emergência sem cobertura — líderes selecionados
state.lideres = [
  { id: "l1", nome: "Líder Um", whatsapp: "47991110001", ativo: true },
  { id: "l2", nome: "Líder Dois", whatsapp: "47991110002", ativo: true },
  { id: "l3", nome: "Líder Três", whatsapp: "47991110003", ativo: false },
];
state.configuracoes.whatsapp = {
  ...WA.cfgPadrao(),
  modo: "manual",
  notificarEmergenciaSemCobertura: true,
  lideresRecebemEmergenciaIds: ["l1", "l2"],
};
sandbox.window.DiaconiaHistory = { add() {} };
const msgEm = WA.montarMensagem(state, "emergencia_sem_cobertura", {
  nomeLider: "Líder Um",
  diaconoNome: "João Silva",
  data: "2026-09-13",
});
assert("mensagem emergência menciona diácono", msgEm.includes("João Silva"));
assert("mensagem emergência menciona emergência", /emergência/i.test(msgEm));
assert("mensagem emergência menciona data BR", msgEm.includes("13/09/2026"));

const destTodos = WA.lideresDestino(state, null);
assert("lideresDestino null = ativos", destTodos.length === 2 && destTodos.every((l) => l.ativo !== false));
const destNenhum = WA.lideresDestino(state, []);
assert("lideresDestino [] = ninguém", destNenhum.length === 0);
const destFiltro = WA.lideresDestino(state, ["l1"]);
assert("lideresDestino [l1] = um", destFiltro.length === 1 && destFiltro[0].id === "l1");

const em = WA.notificarEmergenciaSemCobertura(state, {
  diaconoId: null,
  diaconoNome: "João Silva",
  data: "2026-09-13",
});
assert("notificarEmergenciaSemCobertura ok", em.ok === true, em.erro || "");
assert("notificarEmergenciaSemCobertura enviou 2", em.enviados === 2, String(em.enviados));

state.configuracoes.whatsapp.lideresRecebemEmergenciaIds = [];
const emVazio = WA.notificarEmergenciaSemCobertura(state, {
  diaconoNome: "João",
  data: "2026-09-13",
});
assert("emergência sem líderes selecionados falha", emVazio.ok === false);

function httpGet(url) {
  return new Promise((resolve) => {
    const req = https.get(
      url,
      {
        headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" },
        timeout: 12000,
      },
      (res) => {
        resolve({ status: res.statusCode, location: res.headers.location || "" });
        res.resume();
      }
    );
    req.on("error", (err) => resolve({ error: err.message }));
    req.on("timeout", () => {
      req.destroy();
      resolve({ error: "timeout" });
    });
  });
}

(async () => {
  const liveUrl = WA.waMeUrl("047997845287", "teste");
  const live = await httpGet(liveUrl);
  const okHttp =
    !live.error && Number(live.status) >= 200 && Number(live.status) < 400;
  assert(
    "HTTP click-to-chat 5547997845287",
    okHttp,
    live.error || `status ${live.status} loc=${live.location}`
  );

  const passed = results.filter((r) => r.ok).length;
  const failed = results.filter((r) => !r.ok).length;
  console.log(JSON.stringify({ total: results.length, passed, failed, results }, null, 2));
  process.exit(failed ? 1 : 0);
})();
