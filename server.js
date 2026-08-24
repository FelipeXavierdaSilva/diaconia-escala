/**
 * Servidor estático + API de estado compartilhado para Railway / produção.
 */
const fs = require("fs");
const path = require("path");
const express = require("express");

const app = express();
const PORT = process.env.PORT || 3000;
const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, "data");
const STATE_FILE = path.join(DATA_DIR, "state.json");

app.disable("x-powered-by");
app.use(express.json({ limit: "15mb" }));

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function readStateFile() {
  ensureDataDir();
  if (!fs.existsSync(STATE_FILE)) return null;
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
  } catch {
    return null;
  }
}

app.get("/api/state", (_req, res) => {
  const state = readStateFile();
  res.json({
    ok: true,
    state,
    updatedAt: state?.meta?.atualizadoEm || null,
  });
});

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

app.put("/api/state", (req, res) => {
  const { state } = req.body || {};
  if (!state || typeof state !== "object") {
    return res.status(400).json({ ok: false, erro: "Estado inválido." });
  }

  ensureDataDir();
  try {
    const existing = readStateFile();
    const merged = existing ? mergeStates(state, existing) : state;
    fs.writeFileSync(STATE_FILE, JSON.stringify(merged));
    res.json({ ok: true, state: merged, merged: true });
  } catch {
    res.status(500).json({ ok: false, erro: "Falha ao gravar estado." });
  }
});

app.get("/health", (_req, res) => {
  res.status(200).json({ ok: true, app: "diaconia-escala" });
});

app.use(
  express.static(ROOT, {
    extensions: ["html"],
    setHeaders(res, filePath) {
      if (filePath.endsWith(".html")) {
        res.setHeader("Cache-Control", "no-cache");
      }
    },
  })
);

app.get("*", (_req, res) => {
  res.sendFile(path.join(ROOT, "index.html"));
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Diaconia Escala ouvindo em http://0.0.0.0:${PORT}`);
});
