/**
 * Ocorrências durante o culto — registro operacional (não é bug do sistema).
 * Visibilidade: privada (só liderança + relator) ou equipe (todos veem).
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
    em_providencia: { texto: "Em providência", tom: "muted" },
    resolvida: { texto: "Resolvida", tom: "ok" },
  };

  /** Compatibilidade com registros antigos */
  const STATUS_LEGACY = {
    vista: "em_providencia",
    arquivada: "resolvida",
  };

  const VISIBILIDADE = {
    privada: { texto: "Só liderança", tom: "muted" },
    equipe: { texto: "Toda a equipe", tom: "ok" },
  };

  function ensure(state) {
    if (!Array.isArray(state.ocorrencias)) state.ocorrencias = [];
    for (const o of state.ocorrencias) normalizar(o);
    return state.ocorrencias;
  }

  function normalizar(o) {
    if (!o || typeof o !== "object") return o;
    if (STATUS_LEGACY[o.status]) o.status = STATUS_LEGACY[o.status];
    if (!STATUS[o.status]) o.status = "registrada";
    if (o.visibilidade !== "equipe" && o.visibilidade !== "privada") {
      o.visibilidade = "privada";
    }
    if (!Array.isArray(o.visualizadoPor)) o.visualizadoPor = [];
    if (o.notaAdmin == null) o.notaAdmin = "";
    if (o.providencia == null) o.providencia = o.notaAdmin || "";
    return o;
  }

  function tipoLabel(id) {
    return TIPOS.find((t) => t.id === id)?.label || id || "Outro";
  }

  function statusInfo(st) {
    const id = STATUS_LEGACY[st] || st;
    return STATUS[id] || { texto: st || "—", tom: "muted" };
  }

  function visibilidadeInfo(v) {
    return VISIBILIDADE[v] || VISIBILIDADE.privada;
  }

  function isLider(sessao) {
    return sessao?.papel === "lider";
  }

  function podeVer(o, sessao) {
    if (!o || !sessao) return false;
    normalizar(o);
    if (isLider(sessao)) return true;
    if (o.criadoPor && o.criadoPor === sessao.usuarioId) return true;
    return o.visibilidade === "equipe";
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

    const visibilidade = payload.visibilidade === "equipe" || payload.exporEquipe === true ? "equipe" : "privada";

    const item = {
      id: Engine().uid("ocr"),
      data,
      tipo: payload.tipo || "observacao",
      titulo,
      descricao,
      status: "registrada",
      visibilidade,
      criadoEm: new Date().toISOString(),
      criadoPor: sessao?.usuarioId || null,
      criadoPorNome: sessao?.nome || "Usuário",
      criadoPorPapel: sessao?.papel || null,
      diaconoId: sessao?.diaconoId || null,
      notaAdmin: "",
      providencia: "",
      visualizadoPor: sessao?.usuarioId ? [sessao.usuarioId] : [],
    };

    state.ocorrencias.unshift(item);
    if (state.ocorrencias.length > 500) state.ocorrencias.length = 500;

    Hist().add(state, {
      tipo: "ocorrencia",
      mensagem: `Ocorrência no culto ${data}: ${titulo} (${sessao?.nome || "usuário"}; ${visibilidade === "equipe" ? "equipe" : "privada"}).`,
      usuarioId: sessao?.usuarioId,
      meta: { ocorrenciaId: item.id, data, visibilidade },
    });

    for (const u of state.usuarios || []) {
      if (u.papel !== "lider") continue;
      if (u.id === sessao?.usuarioId) continue;
      Hist().notify(state, {
        usuarioId: u.id,
        titulo: "Nova ocorrência no culto",
        corpo: `${sessao?.nome || "Alguém"} registrou em ${Cal().formatBR?.(data) || data}: ${titulo}${
          visibilidade === "equipe" ? " (visível à equipe)" : " (só liderança)"
        }`,
        link: "?ir=ocorrencias",
        meta: { tipo: "ocorrencia_culto", ocorrenciaId: item.id },
      });
    }

    if (visibilidade === "equipe") {
      for (const u of state.usuarios || []) {
        if (u.papel === "lider") continue;
        if (u.id === sessao?.usuarioId) continue;
        Hist().notify(state, {
          usuarioId: u.id,
          titulo: "Ocorrência compartilhada",
          corpo: `${sessao?.nome || "Alguém"} compartilhou com a equipe: ${titulo} (${Cal().formatBR?.(data) || data})`,
          link: "?ir=ocorrencias",
          meta: { tipo: "ocorrencia_culto", ocorrenciaId: item.id },
        });
      }
    }

    return { ok: true, ocorrencia: item };
  }

  function marcarVisualizacao(state, id, sessao) {
    ensure(state);
    const o = state.ocorrencias.find((x) => x.id === id);
    if (!o || !sessao?.usuarioId) return { ok: false };
    if (!podeVer(o, sessao)) return { ok: false, erro: "Sem permissão." };
    normalizar(o);
    if (!o.visualizadoPor.includes(sessao.usuarioId)) {
      o.visualizadoPor.push(sessao.usuarioId);
    }
    return { ok: true, ocorrencia: o };
  }

  function destinatariosAtualizacao(state, o, sessaoAdmin) {
    const ids = new Set();
    if (o.criadoPor) ids.add(o.criadoPor);
    for (const uid of o.visualizadoPor || []) {
      if (uid) ids.add(uid);
    }
    if (sessaoAdmin?.usuarioId) ids.delete(sessaoAdmin.usuarioId);
    return [...ids];
  }

  function atualizar(state, id, patch, sessao) {
    ensure(state);
    const o = state.ocorrencias.find((x) => x.id === id);
    if (!o) return { ok: false, erro: "Ocorrência não encontrada." };
    if (!podeVer(o, sessao)) return { ok: false, erro: "Sem permissão." };

    const antes = {
      status: o.status,
      providencia: String(o.providencia || o.notaAdmin || "").trim(),
      visibilidade: o.visibilidade,
    };

    const soLider = isLider(sessao);
    const ehDono = o.criadoPor && o.criadoPor === sessao?.usuarioId;

    if (soLider) {
      if (patch.titulo !== undefined) o.titulo = String(patch.titulo || "").trim();
      if (patch.descricao !== undefined) o.descricao = String(patch.descricao || "").trim();
      if (patch.tipo !== undefined) o.tipo = patch.tipo || o.tipo;
      if (patch.data !== undefined) o.data = String(patch.data || o.data).trim();
      if (patch.status !== undefined) {
        const st = STATUS_LEGACY[patch.status] || patch.status;
        if (!STATUS[st]) return { ok: false, erro: "Status inválido." };
        o.status = st;
      }
      if (patch.providencia !== undefined || patch.notaAdmin !== undefined) {
        const txt = String(patch.providencia ?? patch.notaAdmin ?? "").trim();
        o.providencia = txt;
        o.notaAdmin = txt;
      }
      if (patch.visibilidade !== undefined) {
        o.visibilidade = patch.visibilidade === "equipe" ? "equipe" : "privada";
      }
    } else if (ehDono) {
      if (patch.visibilidade !== undefined) {
        o.visibilidade = patch.visibilidade === "equipe" ? "equipe" : "privada";
      }
    } else {
      return { ok: false, erro: "Sem permissão para editar." };
    }

    o.atualizadoEm = new Date().toISOString();
    o.atualizadoPor = sessao?.usuarioId || null;

    Hist().add(state, {
      tipo: "ocorrencia",
      mensagem: `Ocorrência ${id} atualizada (${o.status}).`,
      usuarioId: sessao?.usuarioId,
      meta: { ocorrenciaId: id },
    });

    const providenciaAgora = String(o.providencia || "").trim();
    const mudouStatus = antes.status !== o.status;
    const mudouProvidencia = antes.providencia !== providenciaAgora;
    const mudouVis = antes.visibilidade !== o.visibilidade;

    if (soLider && (mudouStatus || mudouProvidencia)) {
      const st = statusInfo(o.status);
      const corpoPartes = [`Status: ${st.texto}`];
      if (providenciaAgora) corpoPartes.push(`Providência: ${providenciaAgora.slice(0, 160)}`);
      for (const uid of destinatariosAtualizacao(state, o, sessao)) {
        Hist().notify(state, {
          usuarioId: uid,
          titulo: mudouStatus && o.status === "resolvida" ? "Ocorrência resolvida" : "Atualização na ocorrência",
          corpo: `${o.titulo} — ${corpoPartes.join(" · ")}`,
          link: "?ir=ocorrencias",
          meta: { tipo: "ocorrencia_atualizacao", ocorrenciaId: id },
        });
      }
    }

    if (mudouVis && o.visibilidade === "equipe" && antes.visibilidade === "privada") {
      for (const u of state.usuarios || []) {
        if (u.papel === "lider") continue;
        if (u.id === sessao?.usuarioId) continue;
        if (u.id === o.criadoPor) continue;
        Hist().notify(state, {
          usuarioId: u.id,
          titulo: "Ocorrência compartilhada",
          corpo: `${o.titulo} passou a ser visível para a equipe.`,
          link: "?ir=ocorrencias",
          meta: { tipo: "ocorrencia_culto", ocorrenciaId: id },
        });
      }
    }

    return { ok: true, ocorrencia: o };
  }

  function excluir(state, id, sessao) {
    ensure(state);
    if (!isLider(sessao)) return { ok: false, erro: "Só a liderança pode excluir." };
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

  function listar(state, { data, status, meus, usuarioId, sessao } = {}) {
    let lista = [...ensure(state)];
    if (sessao) lista = lista.filter((o) => podeVer(o, sessao));
    if (data) lista = lista.filter((o) => o.data === data);
    if (status) {
      const st = STATUS_LEGACY[status] || status;
      lista = lista.filter((o) => o.status === st);
    }
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
    VISIBILIDADE,
    ensure,
    normalizar,
    tipoLabel,
    statusInfo,
    visibilidadeInfo,
    podeVer,
    datasCultoOpcoes,
    criar,
    marcarVisualizacao,
    atualizar,
    excluir,
    listar,
  };
})();
