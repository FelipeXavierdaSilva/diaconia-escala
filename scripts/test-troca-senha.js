/**
 * Teste: primeiro acesso → trocar senha em Minha conta → login com senha nova.
 */
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const http = require("http");

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

function mergeUsuarioLists(localUsers, remoteUsers) {
  const map = new Map((remoteUsers || []).map((u) => [u.id, u]));
  for (const lu of localUsers || []) {
    const ru = map.get(lu.id);
    if (!ru) {
      map.set(lu.id, lu);
      continue;
    }
    const lt = lu.atualizadoEm || "";
    const rt = ru.atualizadoEm || "";
    const merged = lt >= rt ? { ...ru, ...lu } : { ...lu, ...ru };
    if (!merged.senha) merged.senha = lu.senha || ru.senha || "";
    map.set(lu.id, merged);
  }
  return [...map.values()];
}

function mergeStates(local, remote) {
  if (!remote) return local;
  if (!local) return remote;
  const localTs = local.meta?.atualizadoEm || "";
  const remoteTs = remote.meta?.atualizadoEm || "";
  const base = remoteTs > localTs ? { ...local, ...remote } : { ...remote, ...local };
  base.usuarios = mergeUsuarioLists(local.usuarios, remote.usuarios);
  base.meta = {
    ...(base.meta || {}),
    atualizadoEm: localTs >= remoteTs ? localTs || remoteTs : remoteTs,
  };
  return base;
}

/** Simula o clique em "Salvar meus dados" (Minha conta) */
function salvarSenhaMinhaConta(state, Auth, Storage, { login, senhaAtual, senhaNova }) {
  const loginRes = Auth.login(login, senhaAtual, state);
  if (!loginRes.ok) return { ok: false, erro: loginRes.erro };

  const sessao = Auth.sessao();
  const u = state.usuarios.find((x) => x.id === sessao?.usuarioId);
  if (!u) return { ok: false, erro: "Usuário não encontrado." };

  if (senhaNova) {
    u.senha = senhaNova;
    Storage.touchUsuario(u);
  }

  Storage.save(state, { skipPush: true });
  return { ok: true, usuario: u, sessao };
}

function loadModules() {
  const window = {
    localStorage: makeStorage(),
    sessionStorage: makeStorage(),
    location: { protocol: "http:", origin: "http://localhost:3000", pathname: "/" },
    fetch: global.fetch,
    addEventListener() {},
    removeEventListener() {},
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
    localStorage: window.localStorage,
    sessionStorage: window.sessionStorage,
    fetch: global.fetch,
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);

  for (const f of [
    "js/data/seed.js",
    "js/core/calendar.js",
    "js/core/engine.js",
    "js/core/auth.js",
    "js/services/history.js",
    "js/core/storage.js",
  ]) {
    const code = fs.readFileSync(path.join(root, f), "utf8");
    vm.runInContext(code, sandbox, { filename: f });
  }

  return {
    Seed: sandbox.window.DiaconiaSeed,
    Auth: sandbox.window.DiaconiaAuth,
    Storage: sandbox.window.DiaconiaStorage,
    KEY: "diaconia_escala_v3",
    window,
  };
}

function httpJson(method, urlPath, body, port = Number(process.env.TEST_PORT) || 3001) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const req = http.request(
      {
        hostname: "127.0.0.1",
        port,
        path: urlPath,
        method,
        headers: body ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(data) } : {},
      },
      (res) => {
        let raw = "";
        res.on("data", (c) => (raw += c));
        res.on("end", () => {
          try {
            resolve({ status: res.statusCode, data: JSON.parse(raw) });
          } catch {
            resolve({ status: res.statusCode, data: raw });
          }
        });
      }
    );
    req.on("error", reject);
    if (data) req.write(data);
    req.end();
  });
}

async function main() {
  const { Seed, Auth, Storage, KEY, window } = loadModules();
  const state = Seed.build();
  const SENHA_INICIAL = "felipe123";
  const SENHA_NOVA = "MinhaSenha2026!";

  // 1) Login inicial (como no primeiro acesso)
  Auth.logout();
  const primeiroLogin = Auth.login("felipe", SENHA_INICIAL, state);
  assert("1º login com senha inicial", primeiroLogin.ok === true);
  assert("sessão criada", !!Auth.sessao()?.usuarioId);

  // 2) Troca de senha em Minha conta
  Auth.logout();
  const troca = salvarSenhaMinhaConta(state, Auth, Storage, {
    login: "felipe",
    senhaAtual: SENHA_INICIAL,
    senhaNova: SENHA_NOVA,
  });
  assert("troca de senha ok", troca.ok === true);
  assert("senha atualizada no state", troca.usuario?.senha === SENHA_NOVA);
  assert("atualizadoEm definido", !!troca.usuario?.atualizadoEm);

  // 3) Senha antiga não funciona mais
  Auth.logout();
  const loginAntigo = Auth.login("felipe", SENHA_INICIAL, state);
  assert("senha antiga rejeitada", loginAntigo.ok === false, loginAntigo.erro || "");

  // 4) Senha nova funciona
  Auth.logout();
  const loginNovo = Auth.login("felipe", SENHA_NOVA, state);
  assert("login com senha nova", loginNovo.ok === true);
  assert("sessão do Felipe", loginNovo.sessao?.nome === "Felipe");

  // 5) Persistência no localStorage (recarregar página)
  Auth.logout();
  const raw = window.localStorage.getItem(KEY);
  assert("state salvo no localStorage", !!raw);
  const reloaded = JSON.parse(raw);
  const felipe = reloaded.usuarios.find((u) => u.login === "felipe");
  assert("localStorage tem senha nova", felipe?.senha === SENHA_NOVA);

  const loginAposReload = Auth.login("felipe", SENHA_NOVA, reloaded);
  assert("login após reload localStorage", loginAposReload.ok === true);

  // 6) Campo vazio não altera senha
  Auth.logout();
  const state2 = JSON.parse(JSON.stringify(reloaded));
  const manter = salvarSenhaMinhaConta(state2, Auth, Storage, {
    login: "felipe",
    senhaAtual: SENHA_NOVA,
    senhaNova: "",
  });
  assert("senha vazia mantém atual", manter.usuario?.senha === SENHA_NOVA);
  const loginAposVazio = Auth.login("felipe", SENHA_NOVA, state2);
  assert("login após senha vazia", loginAposVazio.ok === true);

  // 7) Merge servidor: senha nova do diácono prevalece sobre remota antiga
  const remotoAntigo = JSON.parse(JSON.stringify(state));
  remotoAntigo.usuarios.find((u) => u.login === "felipe").senha = SENHA_INICIAL;
  remotoAntigo.usuarios.find((u) => u.login === "felipe").atualizadoEm = "2020-01-01T00:00:00.000Z";

  const localNovo = JSON.parse(JSON.stringify(state));
  localNovo.usuarios.find((u) => u.login === "felipe").senha = SENHA_NOVA;
  localNovo.usuarios.find((u) => u.login === "felipe").atualizadoEm = "2026-08-24T22:00:00.000Z";

  const merged = mergeStates(localNovo, remotoAntigo);
  const felipeMerged = merged.usuarios.find((u) => u.login === "felipe");
  assert("merge servidor mantém senha nova", felipeMerged?.senha === SENHA_NOVA);
  Auth.logout();
  assert("login após merge", Auth.login("felipe", SENHA_NOVA, merged).ok === true);
  assert("senha antiga falha após merge", Auth.login("felipe", SENHA_INICIAL, merged).ok === false);

  // 8) Teste HTTP no servidor (se estiver rodando)
  try {
    const health = await httpJson("GET", "/health");
    if (health.status === 200) {
      const payload = JSON.parse(JSON.stringify(state));
      payload.usuarios.find((u) => u.login === "felipe").senha = "SenhaServidorTeste99";
      Storage.touchUsuario(payload.usuarios.find((u) => u.login === "felipe"));
      payload.meta = payload.meta || {};
      payload.meta.atualizadoEm = new Date().toISOString();

      const put = await httpJson("PUT", "/api/state", { state: payload });
      assert("PUT /api/state", put.status === 200 && put.data?.ok === true, String(put.status));

      const get = await httpJson("GET", "/api/state");
      const felipeSrv = get.data?.state?.usuarios?.find((u) => u.login === "felipe");
      assert("GET confirma senha no servidor", felipeSrv?.senha === "SenhaServidorTeste99");

      Auth.logout();
      assert(
        "login com senha do servidor",
        Auth.login("felipe", "SenhaServidorTeste99", get.data.state).ok === true
      );
    } else {
      assert("servidor HTTP", false, "health não respondeu 200");
    }
  } catch (e) {
    assert("servidor HTTP", false, e.code || e.message || "offline");
  }

  const passed = results.filter((r) => r.ok).length;
  const failed = results.filter((r) => !r.ok).length;

  console.log(JSON.stringify({ total: results.length, passed, failed, results }, null, 2));

  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
