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

app.put("/api/state", (req, res) => {
  const { state } = req.body || {};
  if (!state || typeof state !== "object") {
    return res.status(400).json({ ok: false, erro: "Estado inválido." });
  }

  ensureDataDir();
  try {
    const existing = readStateFile();
    const incomingTs = state.meta?.atualizadoEm || "";
    const existingTs = existing?.meta?.atualizadoEm || "";
    if (existing && existingTs > incomingTs) {
      return res.json({
        ok: true,
        state: existing,
        merged: false,
        reason: "stale",
      });
    }
    fs.writeFileSync(STATE_FILE, JSON.stringify(state));
    res.json({ ok: true, state, merged: true });
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
