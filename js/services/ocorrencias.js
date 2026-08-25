/**
 * Ocorrências durante o culto — registro operacional (não é bug do sistema).
 */
window.DiaconiaOcorrencias = (() => {
  const Engine = () => window.DiaconiaEngine;
  const Hist = () => window.DiaconiaHistory;
  const Cal = () => window.DiaconiaCalendar;

  const TIPOS = [
    { id: "ausencia", label: "Ausência / atraso" },
    { id: "incidente", label: "Incidente" },
    { id: "material", label: "Material / estrutura" },
    { id: "pessoa", label: "Atenção a pessoa" },
    { id: "observacao", label: "Observação geral" },
    { id: "outro", label: "Outro" },
  ];

  const STATUS = {
    registrada: { texto: "Registrada", tom: "warn" },
    vista: { texto: "Vista pela liderança", tom: "muted" },
    arquivada: { texto: "Arquivada", tom: "ok" },
  };

  function ensure(state) {
    if (!Array.isArray(state.ocorrencias)) state.ocorrencias = [];
    return state.ocorrencias;
  }

  function tipoLabel(id) {
    return TIPOS.find((t) => t.id === id)?.label || id || "Outro";
  }

  function statusInfo(st) {
    return STATUS[st] || { texto: st || "—", tom: "muted" };
  }

  function datasCultoOpcoes(state, { limite = 24 } = {}) {
    const hoje = Cal().hojeISO();
    const datas = Object.values(state.escalas || {})
      .map((e) => e.data)
      .filter(Boolean)
      .sort((a, b) => b.localeCompare(a));
    const recentes = datas.filter((d) => d <= hoje).slice(0, Math.ceil(limite * 0.75));
    const futuras = datas.filter((d) => d > hoje).slice(0, Math.floor(limite * 0.25));
    return [...new Set([...futuras.reverse(), ...recentes])];
  }

  function criar(state, payload, sessao) {
    ensure(state);
    const data = String(payload.data || "").trim();
    const titulo = String(payload.titulo || "").trim();
    const descricao = String(payload.descricao || "").trim();
    if (!data) return { ok: false, erro: "Selecione a data do culto." };
    if (!titulo) return { ok: false, erro: "Informe um título curto." };
    if (descricao.length < 5) {
      return { ok: false, erro: "Descreva o que aconteceu no culto (pelo menos algumas palavras)." };
    }

    const item = {
      id: Engine().uid("ocr"),
      data,
      tipo: payload.tipo || "observacao",
      titulo,
      descricao,
      status: "registrada",
      criadoEm: new Date().toISOString(),
      criadoPor: sessao?.usuarioId || null,
      criadoPorNome: sessao?.nome || "Usuário",
      criadoPorPapel: sessao?.papel || null,
      diaconoId: sessao?.diaconoId || null,
      notaAdmin: "",
    };

    state.ocorrencias.unshift(item);
    if (state.ocorrencias.length > 500) state.ocorrencias.length = 500;

    Hist().add(state, {
      tipo: "ocorrencia",
      mensagem: `Ocorrência no culto ${data}: ${titulo} (${sessao?.nome || "usuário"}).`,
      usuarioId: sessao?.usuarioId,
      meta: { ocorrenciaId: item.id, data },
    });

    for (const u of state.usuarios || []) {
      if (u.papel !== "lider") continue;
      if (u.id === sessao?.usuarioId) continue;
      Hist().notify(state, {
        usuarioId: u.id,
        titulo: "Nova ocorrência no culto",
        corpo: `${sessao?.nome || "Alguém"} registrou em ${Cal().formatBR?.(data) || data}: ${titulo}`,
        link: "?ir=ocorrencias",
        meta: { tipo: "ocorrencia_culto", ocorrenciaId: item.id },
      });
    }

    return { ok: true, ocorrencia: item };
  }

  function atualizar(state, id, patch, sessao) {
    ensure(state);
    const o = state.ocorrencias.find((x) => x.id === id);
    if (!o) return { ok: false, erro: "Ocorrência não encontrada." };

    if (patch.titulo !== undefined) o.titulo = String(patch.titulo || "").trim();
    if (patch.descricao !== undefined) o.descricao = String(patch.descricao || "").trim();
    if (patch.tipo !== undefined) o.tipo = patch.tipo || o.tipo;
    if (patch.data !== undefined) o.data = String(patch.data || o.data).trim();
    if (patch.status !== undefined) {
      if (!STATUS[patch.status]) return { ok: false, erro: "Status inválido." };
      o.status = patch.status;
    }
    if (patch.notaAdmin !== undefined) o.notaAdmin = String(patch.notaAdmin || "").trim();
    o.atualizadoEm = new Date().toISOString();
    o.atualizadoPor = sessao?.usuarioId || null;

    Hist().add(state, {
      tipo: "ocorrencia",
      mensagem: `Ocorrência ${id} atualizada.`,
      usuarioId: sessao?.usuarioId,
      meta: { ocorrenciaId: id },
    });

    return { ok: true, ocorrencia: o };
  }

  function excluir(state, id, sessao) {
    ensure(state);
    const before = state.ocorrencias.length;
    state.ocorrencias = state.ocorrencias.filter((x) => x.id !== id);
    if (state.ocorrencias.length === before) return { ok: false, erro: "Ocorrência não encontrada." };
    Hist().add(state, {
      tipo: "ocorrencia",
      mensagem: `Ocorrência excluída (${id}).`,
      usuarioId: sessao?.usuarioId,
    });
    return { ok: true };
  }

  function listar(state, { data, status, meus, usuarioId } = {}) {
    let lista = [...ensure(state)];
    if (data) lista = lista.filter((o) => o.data === data);
    if (status) lista = lista.filter((o) => o.status === status);
    if (meus && usuarioId) lista = lista.filter((o) => o.criadoPor === usuarioId);
    return lista.sort((a, b) => {
      const d = String(b.data || "").localeCompare(String(a.data || ""));
      if (d) return d;
      return String(b.criadoEm || "").localeCompare(String(a.criadoEm || ""));
    });
  }

  return {
    TIPOS,
    STATUS,
    ensure,
    tipoLabel,
    statusInfo,
    datasCultoOpcoes,
    criar,
    atualizar,
    excluir,
    listar,
  };
})();
