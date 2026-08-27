/**
 * Histórico de backups — cópias completas do sistema compartilhadas entre líderes.
 */
window.DiaconiaBackupHistorico = (() => {
  const LIMITE = 15;

  const MOTIVOS = {
    manual: { texto: "Manual", tom: "ok" },
    exportacao: { texto: "Exportação", tom: "muted" },
    antes_restaurar: { texto: "Antes de restaurar", tom: "warn" },
    importacao: { texto: "Importação", tom: "muted" },
  };

  function Engine() {
    return window.DiaconiaEngine;
  }
  function Storage() {
    return window.DiaconiaStorage;
  }
  function Hist() {
    return window.DiaconiaHistory;
  }

  function ensure(state) {
    if (!Array.isArray(state.backupsHistorico)) state.backupsHistorico = [];
    return state.backupsHistorico;
  }

  function clonar(obj) {
    try {
      return JSON.parse(JSON.stringify(obj));
    } catch {
      return null;
    }
  }

  function snapshotDados(state) {
    const copia = clonar(state);
    if (!copia) return null;
    delete copia.backupsHistorico;
    return copia;
  }

  function resumo(dados) {
    return {
      escalas: Object.keys(dados?.escalas || {}).length,
      diaconos: (dados?.diaconos || []).length,
      restricoes: (dados?.restricoes || []).length,
      trocas: (dados?.trocas || []).length,
      ocorrencias: (dados?.ocorrencias || []).length,
    };
  }

  function motivoInfo(motivo) {
    return MOTIVOS[motivo] || { texto: motivo || "Backup", tom: "muted" };
  }

  function nomeUsuario(state, id, fallback = "") {
    if (!id) return fallback || "Sistema";
    const u = (state.usuarios || []).find((x) => x.id === id);
    return u?.nome || u?.login || fallback || "—";
  }

  function guardar(state, { motivo, observacao, usuarioId, usuarioNome, dados } = {}) {
    ensure(state);
    const snapshot = dados ? clonar(dados) : snapshotDados(state);
    if (!snapshot) return { ok: false, erro: "Não foi possível copiar os dados." };
    if (Storage()?.isValidState && !Storage().isValidState(snapshot)) {
      return { ok: false, erro: "Estado inválido para guardar." };
    }

    const item = {
      id: Engine().uid("bhst"),
      em: new Date().toISOString(),
      motivo: motivo || "manual",
      observacao: String(observacao || "").trim(),
      usuarioId: usuarioId || null,
      usuarioNome: usuarioNome || nomeUsuario(state, usuarioId),
      resumo: resumo(snapshot),
      dados: snapshot,
    };
    state.backupsHistorico.unshift(item);
    if (state.backupsHistorico.length > LIMITE) state.backupsHistorico.length = LIMITE;
    return { ok: true, item };
  }

  function get(state, id) {
    return ensure(state).find((x) => x.id === id) || null;
  }

  function listar(state) {
    return [...ensure(state)];
  }

  function excluir(state, id) {
    const before = ensure(state).length;
    state.backupsHistorico = state.backupsHistorico.filter((x) => x.id !== id);
    return { ok: state.backupsHistorico.length < before };
  }

  function excluirVarios(state, ids) {
    const set = new Set(ids || []);
    const before = ensure(state).length;
    state.backupsHistorico = state.backupsHistorico.filter((x) => !set.has(x.id));
    return { ok: state.backupsHistorico.length < before, qtd: before - state.backupsHistorico.length };
  }

  function guardarAntesRestaurar(state, { usuarioId, usuarioNome, origem } = {}) {
    return guardar(state, {
      motivo: "antes_restaurar",
      observacao: origem
        ? `Cópia automática antes de restaurar: ${origem}`
        : "Cópia automática antes de restaurar backup.",
      usuarioId,
      usuarioNome,
    });
  }

  /**
   * Substitui o estado pelos dados do backup, preservando o histórico compartilhado.
   */
  function restaurar(state, id, { usuarioId, usuarioNome } = {}) {
    const item = get(state, id);
    if (!item?.dados) return { ok: false, erro: "Backup não encontrado no histórico." };
    if (Storage()?.isValidState && !Storage().isValidState(item.dados)) {
      return { ok: false, erro: "Este backup está corrompido ou incompleto." };
    }

    const antes = guardarAntesRestaurar(state, {
      usuarioId,
      usuarioNome,
      origem: item.em ? new Date(item.em).toLocaleString("pt-BR") : item.id,
    });
    if (!antes.ok) return { ok: false, erro: antes.erro || "Falha ao guardar cópia de segurança." };

    const historico = [...ensure(state)];
    const dados = clonar(item.dados);
    if (!dados) return { ok: false, erro: "Falha ao ler dados do backup." };

    for (const key of Object.keys(state)) {
      if (key !== "backupsHistorico") delete state[key];
    }
    Object.assign(state, dados);
    state.backupsHistorico = historico;

    Hist()?.add?.(state, {
      tipo: "backup",
      mensagem: `Backup restaurado do histórico (${item.em ? new Date(item.em).toLocaleString("pt-BR") : item.id}).`,
      usuarioId,
      meta: { backupHistoricoId: id },
    });

    return { ok: true, item, copiaSeguranca: antes.item };
  }

  function downloadItem(state, id) {
    const item = get(state, id);
    if (!item?.dados) return { ok: false, erro: "Backup não encontrado." };
    const St = Storage();
    if (!St?.buildBackup) return { ok: false, erro: "Serviço de backup indisponível." };

    const pacote = St.buildBackup(item.dados);
    const blob = new Blob([JSON.stringify(pacote, null, 2)], { type: "application/json" });
    const stamp = item.em ? item.em.slice(0, 19).replace(/[:T]/g, "-") : "historico";
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

  return {
    MOTIVOS,
    LIMITE,
    ensure,
    motivoInfo,
    resumo,
    snapshotDados,
    guardar,
    guardarAntesRestaurar,
    get,
    listar,
    excluir,
    excluirVarios,
    restaurar,
    downloadItem,
    nomeUsuario,
  };
})();
