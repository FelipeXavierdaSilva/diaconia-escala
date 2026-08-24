/**
 * Camada de armazenamento — localStorage agora, API depois.
 * Inclui backup/restauração em arquivo JSON.
 */
window.DiaconiaStorage = (() => {
  const KEY = "diaconia_escala_v3";
  const BACKUP_FORMAT = "diaconia-backup";
  const BACKUP_VERSION = 1;
  const SYNC_ENABLED =
    typeof window !== "undefined" &&
    (window.location.protocol === "http:" || window.location.protocol === "https:");

  let _pushTimer = null;

  function touchMeta(state) {
    if (!state.meta) state.meta = {};
    state.meta.atualizadoEm = new Date().toISOString();
  }

  /** Mescla listas de usuários — cada conta fica com a versão mais recente (senha, etc.). */
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
    if (local.lideres && remote.lideres) {
      const byId = new Map(remote.lideres.map((l) => [l.id, l]));
      for (const l of local.lideres) {
        const r = byId.get(l.id);
        if (!r || (l.atualizadoEm || "") >= (r.atualizadoEm || "")) byId.set(l.id, l);
      }
      base.lideres = [...byId.values()];
    }
    return base;
  }

  function touchUsuario(usuario) {
    if (!usuario) return;
    usuario.atualizadoEm = new Date().toISOString();
  }

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  function migrate(state) {
    if (!state || typeof state !== "object") return state;
    if (!Array.isArray(state.casais)) state.casais = [];
    if (!state.configuracoes) state.configuracoes = {};
    if (state.configuracoes.respeitarCasais === undefined) {
      state.configuracoes.respeitarCasais = true;
    }
    if (state.configuracoes.umaEquipePorDia === undefined) {
      state.configuracoes.umaEquipePorDia = true;
    }
    if (!state.configuracoes.geracao || typeof state.configuracoes.geracao !== "object") {
      state.configuracoes.geracao = {};
    }
    const g = state.configuracoes.geracao;
    if (g.variarFuncoesNoMes === undefined) g.variarFuncoesNoMes = true;
    if (g.evitarMesmaFuncaoConsecutiva === undefined) g.evitarMesmaFuncaoConsecutiva = true;
    if (g.embaralharOrdemFuncoes === undefined) g.embaralharOrdemFuncoes = true;
    if (g.equilibrarParticipacao === undefined) g.equilibrarParticipacao = true;
    if (g.maxEscalasPorDiaconoNoMes === undefined) g.maxEscalasPorDiaconoNoMes = 0;
    if (g.maxPessoasPorCulto === undefined) g.maxPessoasPorCulto = 0;
    if (g.maxPessoasPorEvento === undefined) g.maxPessoasPorEvento = 0;
    if (!state.meta) state.meta = {};

    // Contar Oferta: alinhar qtd com instrução (2 pessoas)
    const of = (state.funcoes || []).find((f) => f.id === "contar_oferta");
    if (of && of.qtdPorEquipe < 2) of.qtdPorEquipe = 2;

    // Migra escalas antigas (2 equipes no mesmo dia) → 1 equipe responsável por data
    if (!state.meta.modeloEquipePorDia) {
      const eqsAtivas = (state.equipes || [])
        .filter((e) => e.ativa !== false)
        .map((e) => e.id);
      const fallback = eqsAtivas.length ? eqsAtivas : ["eq01"];
      const datas = Object.keys(state.escalas || {}).sort();
      datas.forEach((data, i) => {
        const esc = state.escalas[data];
        if (!esc) return;
        if (!Array.isArray(esc.equipesIds) || esc.equipesIds.length !== 1) {
          // Preserva a equipe que já tem mais atribuições
          let best = fallback[i % fallback.length];
          let bestCount = -1;
          for (const eqId of esc.equipesIds || []) {
            const atr = esc.atribuicoes?.[eqId] || {};
            const n = Object.values(atr).reduce((s, ids) => s + (ids?.length || 0), 0);
            if (n > bestCount) {
              bestCount = n;
              best = eqId;
            }
          }
          const keep = esc.atribuicoes?.[best] || {};
          esc.equipesIds = [best];
          esc.atribuicoes = { [best]: keep };
          esc.problemas = (esc.problemas || []).filter((p) => p.equipeId === best);
          esc.status = "rascunho";
        }
      });
      state.meta.modeloEquipePorDia = true;
      state.configuracoes.umaEquipePorDia = true;
    }

    // Troca/cobertura: não exige mais liderança — concluir pedidos antigos "aguardando_lider"
    state.configuracoes.exigirAprovacaoTroca = false;
    if (typeof window.DiaconiaSwaps?.concluirPendentesSemLider === "function") {
      window.DiaconiaSwaps.concluirPendentesSemLider(state);
    } else {
      for (const t of state.trocas || []) {
        if (t.status === "aguardando_lider") {
          t.status = "aprovada";
          t.aprovadaEm = t.aprovadaEm || new Date().toISOString();
          t.migradoSemLider = true;
        }
      }
    }

    // Equipes: nome só aparece ao diácono após a liderança definir
    for (const eq of state.equipes || []) {
      if (eq.nomeDefinido === undefined) eq.nomeDefinido = false;
    }

    // Escalas: só entram no PDF as marcadas pelo botão Gerar escala
    for (const esc of Object.values(state.escalas || {})) {
      if (esc.gerada === undefined) esc.gerada = false;
    }

    // Usuários: WhatsApp no cadastro
    for (const u of state.usuarios || []) {
      if (u.whatsapp === undefined) u.whatsapp = "";
    }

    // Diácono sem perfil vinculado → cria cadastro mínimo automaticamente
    if (!state.meta.perfilDiaconoAuto) {
      const eqPadrao =
        (state.equipes || []).find((e) => e.ativa !== false)?.id || "eq01";
      const uid = (p) =>
        typeof window.DiaconiaEngine?.uid === "function"
          ? window.DiaconiaEngine.uid(p)
          : `${p}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      for (const u of state.usuarios || []) {
        if (u.papel !== "diacono" || u.diaconoId) continue;
        const wa = String(u.whatsapp || "").replace(/\D/g, "");
        const id = uid("d");
        state.diaconos.push({
          id,
          nome: u.nome,
          equipeId: eqPadrao,
          funcaoMinisterio: "",
          funcaoDiaconatoId: "",
          whatsapp: wa,
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
        });
        u.diaconoId = id;
      }
      state.meta.perfilDiaconoAuto = true;
    }

    // Líderes: vínculo com conta de usuário + sincronizar liderança
    for (const l of state.lideres || []) {
      if (l.usuarioId === undefined) l.usuarioId = null;
    }
    for (const u of state.usuarios || []) {
      if (u.papel !== "lider") continue;
      const wa = String(u.whatsapp || "").replace(/\D/g, "");
      let l = (state.lideres || []).find((x) => x.usuarioId === u.id);
      if (!l) {
        l = (state.lideres || []).find((x) => !x.usuarioId && x.nome === u.nome);
        if (l) l.usuarioId = u.id;
      }
      if (!l) {
        state.lideres.push({
          id: `l_${u.id}`,
          usuarioId: u.id,
          nome: u.nome,
          whatsapp: wa,
          ativo: true,
        });
      } else {
        l.usuarioId = u.id;
        l.nome = u.nome;
        if (wa) l.whatsapp = wa;
      }
    }

    // Diáconos: função no ministério + função principal no diaconato + WhatsApp
    for (const d of state.diaconos || []) {
      if (d.funcaoMinisterio === undefined) d.funcaoMinisterio = "";
      if (d.funcaoDiaconatoId === undefined) d.funcaoDiaconatoId = "";
      if (d.whatsapp === undefined) d.whatsapp = "";
      if (d.restricaoPessoal === undefined) d.restricaoPessoal = "";
      if (d.casado === undefined) d.casado = false;
      if (d.conjugeNome === undefined) d.conjugeNome = "";
      if (d.conjugeMembroIgreja === undefined) d.conjugeMembroIgreja = false;
      if (!d.casado) d.conjugeMembroIgreja = false;
      if (!Array.isArray(d.filhosNomes)) d.filhosNomes = [];
      if (!Array.isArray(d.filhos)) {
        d.filhos = d.filhosNomes
          .map((n) => String(n || "").trim())
          .filter(Boolean)
          .map((nome) => ({ nome, idade: null }));
      } else {
        d.filhos = d.filhos.map((f) => ({
          nome: String(f?.nome ?? "").trim(),
          idade:
            f?.idade === "" || f?.idade == null || Number.isNaN(Number(f.idade))
              ? null
              : Number(f.idade),
        }));
      }
      d.filhosNomes = d.filhos.map((f) => f.nome).filter(Boolean);
      if (d.qtdFilhos === undefined) d.qtdFilhos = d.filhos.length;
      else d.qtdFilhos = Math.max(Number(d.qtdFilhos) || 0, d.filhos.length);
      if (d.temFilhos === undefined) d.temFilhos = d.qtdFilhos > 0 || d.filhos.length > 0;
      if (d.filhosVaoIgreja === undefined) d.filhosVaoIgreja = false;
      if (!d.temFilhos) {
        d.qtdFilhos = 0;
        d.filhos = [];
        d.filhosNomes = [];
        d.filhosVaoIgreja = false;
      }
    }

    // Canal WhatsApp (manual hoje → API no futuro)
    if (!Array.isArray(state.whatsappFila)) state.whatsappFila = [];
    if (!Array.isArray(state.whatsappLog)) state.whatsappLog = [];
    if (typeof window.DiaconiaWhatsApp?.ensure === "function") {
      window.DiaconiaWhatsApp.ensure(state);
    } else if (!state.configuracoes.whatsapp) {
      state.configuracoes.whatsapp = {
        ativo: true,
        modo: "manual",
        abrirNoNavegador: true,
        notificarPedidoTroca: true,
        notificarRespostaTroca: true,
        notificarCadastroUsuario: true,
        notificarRestricao: true,
        notificarStatusRestricao: true,
        notificarEscalaGerada: false,
        portalBaseUrl: "",
        apiUrl: "",
        apiToken: "",
      };
    }

    return state;
  }

  function save(state, opts = {}) {
    const skipPush = opts.skipPush === true;
    migrate(state);
    touchMeta(state);
    localStorage.setItem(KEY, JSON.stringify(state));
    if (!skipPush) schedulePush();
    return state;
  }

  function schedulePush() {
    if (!SYNC_ENABLED) return;
    clearTimeout(_pushTimer);
    _pushTimer = setTimeout(() => {
      pushRemote().catch(() => {});
    }, 350);
  }

  async function fetchRemote() {
    try {
      const res = await fetch("/api/state", { cache: "no-store" });
      if (!res.ok) return null;
      return await res.json();
    } catch {
      return null;
    }
  }

  async function pullRemote() {
    const remote = await fetchRemote();
    if (!remote?.state) return { ok: true, updated: false, state: load() };

    const local = load();
    const remoteTs = remote.state.meta?.atualizadoEm || remote.updatedAt || "";
    const localTs = local?.meta?.atualizadoEm || "";

    if (!local || remoteTs > localTs) {
      let mergedState = remote.state;
      if (local) {
        mergedState = mergeStates(local, remote.state);
      }
      migrate(mergedState);
      localStorage.setItem(KEY, JSON.stringify(mergedState));
      return { ok: true, updated: true, state: mergedState };
    }

    return { ok: true, updated: false, state: local };
  }

  async function pushRemote(opts = {}) {
    const state = load();
    if (!state || !SYNC_ENABLED) return { ok: false, offline: !SYNC_ENABLED };

    try {
      const res = await fetch("/api/state", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ state }),
      });
      if (!res.ok) return { ok: false, status: res.status };
      const data = await res.json();
      if (data.reason === "stale" && data.state) {
        const merged = mergeStates(state, data.state);
        migrate(merged);
        touchMeta(merged);
        localStorage.setItem(KEY, JSON.stringify(merged));
        if (!opts._retried) {
          return pushRemote({ _retried: true });
        }
        return { ok: true, stale: true, state: merged };
      }
      if (data.state) {
        migrate(data.state);
        localStorage.setItem(KEY, JSON.stringify(data.state));
      }
      return { ok: true, state: data.state || state };
    } catch {
      return { ok: false, network: true };
    }
  }

  /** Salva localmente e aguarda envio ao servidor (senha, usuários, etc.). */
  async function saveAndSync(state) {
    save(state, { skipPush: true });
    const result = await pushRemote();
    return result;
  }

  async function getOrInitAsync() {
    let state = load();
    if (!state) {
      try {
        const legacy = localStorage.getItem("diaconia_escala_v2");
        if (legacy) state = JSON.parse(legacy);
      } catch {
        /* ignore */
      }
    }

    const pulled = await pullRemote();
    if (pulled.updated && pulled.state) {
      state = pulled.state;
    } else if (!state) {
      state = window.DiaconiaSeed.build();
      save(state);
    } else {
      migrate(state);
      save(state, { skipPush: true });
      await pushRemote();
    }

    return state;
  }

  function startSync(onUpdate) {
    if (!SYNC_ENABLED || typeof onUpdate !== "function") return () => {};

    const onStorage = (e) => {
      if (e.key !== KEY || !e.newValue) return;
      try {
        onUpdate(JSON.parse(e.newValue), "local-tab");
      } catch {
        /* ignore */
      }
    };
    window.addEventListener("storage", onStorage);

    const interval = setInterval(async () => {
      const before = load()?.meta?.atualizadoEm || "";
      const result = await pullRemote();
      if (result.updated && result.state && result.state.meta?.atualizadoEm !== before) {
        onUpdate(result.state, "remote");
      }
    }, 4000);

    return () => {
      window.removeEventListener("storage", onStorage);
      clearInterval(interval);
    };
  }

  function reset() {
    localStorage.removeItem(KEY);
  }

  function getOrInit() {
    let state = load();
    if (!state) {
      try {
        const legacy = localStorage.getItem("diaconia_escala_v2");
        if (legacy) state = JSON.parse(legacy);
      } catch {
        /* ignore */
      }
    }
    if (!state) {
      state = window.DiaconiaSeed.build();
      save(state);
    } else {
      migrate(state);
      save(state);
    }
    return state;
  }

  function isValidState(data) {
    return (
      data &&
      typeof data === "object" &&
      Array.isArray(data.diaconos) &&
      Array.isArray(data.equipes) &&
      Array.isArray(data.funcoes) &&
      data.escalas &&
      typeof data.escalas === "object"
    );
  }

  /** Monta pacote de backup com metadados */
  function buildBackup(state) {
    return {
      format: BACKUP_FORMAT,
      versao: BACKUP_VERSION,
      exportadoEm: new Date().toISOString(),
      app: "Diaconia — Escala Inteligente",
      dados: state,
    };
  }

  function downloadBackup(state) {
    const pacote = buildBackup(state);
    const blob = new Blob([JSON.stringify(pacote, null, 2)], {
      type: "application/json",
    });
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
    const nome = `diaconia-backup-${stamp}.json`;
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = nome;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    return { ok: true, nome };
  }

  /**
   * Extrai o estado de um arquivo de backup (com ou sem envelope).
   */
  function parseBackup(rawText) {
    let parsed;
    try {
      parsed = JSON.parse(rawText);
    } catch {
      return { ok: false, erro: "Arquivo JSON inválido." };
    }

    let dados = parsed;
    if (parsed && parsed.format === BACKUP_FORMAT && parsed.dados) {
      dados = parsed.dados;
    }

    if (!isValidState(dados)) {
      return {
        ok: false,
        erro: "Este arquivo não parece ser um backup válido do Diaconia.",
      };
    }

    return {
      ok: true,
      state: dados,
      meta: {
        exportadoEm: parsed.exportadoEm || null,
        versao: parsed.versao || null,
      },
    };
  }

  function restoreBackup(state) {
    if (!isValidState(state)) {
      return { ok: false, erro: "Dados inválidos para restaurar." };
    }
    save(state);
    return { ok: true, state };
  }

  function readFileAsText(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(new Error("Falha ao ler o arquivo."));
      reader.readAsText(file, "utf-8");
    });
  }

  return {
    KEY,
    BACKUP_FORMAT,
    load,
    save,
    reset,
    getOrInit,
    getOrInitAsync,
    pullRemote,
    pushRemote,
    saveAndSync,
    mergeUsuarioLists,
    touchUsuario,
    startSync,
    buildBackup,
    downloadBackup,
    parseBackup,
    restoreBackup,
    readFileAsText,
    isValidState,
  };
})();
