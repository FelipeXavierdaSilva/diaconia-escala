window.DiaconiaRestrictions = (() => {
  const Engine = () => window.DiaconiaEngine;
  const Cal = () => window.DiaconiaCalendar;
  const Hist = () => window.DiaconiaHistory;

  function datasCobertas(restricao) {
    return Engine().datasDaRestricao?.(restricao) || (restricao?.data ? [restricao.data] : []);
  }

  /** Recalcula alerta de escala afetada com base em todas as restrições aprovadas do dia. */
  function recomputarAlertaData(state, data) {
    if (!data) return;
    const esc = state.escalas?.[data];
    if (!esc) return;

    const aprovadas = (state.restricoes || []).filter(
      (r) => r.status === "aprovada" && Engine().restricaoCobreData(r, data)
    );
    let alerta = null;

    for (const r of aprovadas) {
      const afet = Engine().escalasAfetadasPorRestricao(state, r);
      r.afetacoes = afet;
      if (afet.some((a) => a.data === data) && !alerta) {
        alerta = {
          restricaoId: r.id,
          diaconoId: r.diaconoId,
          mensagem: r.motivoViagem
            ? "Escala afetada: diácono em viagem."
            : "Escala afetada por restrição aprovada.",
        };
      }
    }

    if (alerta) esc.alertaAfetacao = alerta;
    else delete esc.alertaAfetacao;
    esc.status = Engine().statusEscala(esc, state);
  }

  function recomputarDatas(state, datas) {
    const uniq = [...new Set((datas || []).filter(Boolean))];
    for (const d of uniq) recomputarAlertaData(state, d);
  }

  function labelMotivoViagem(motivo) {
    if (motivo === "trabalho") return "viagem a trabalho";
    if (motivo === "familiar") return "viagem familiar";
    return "viagem";
  }

  function criar(state, payload, sessao) {
    state.restricoes = state.restricoes || [];
    const statusInicial = payload.aprovarAgora
      ? "aprovada"
      : payload.status || "pendente";

    let data = payload.data;
    let dataFim = payload.dataFim || null;
    if (payload.qtdDias && data) {
      dataFim = Cal().fimPorQtdDias(data, payload.qtdDias);
    }
    if (dataFim && dataFim < data) {
      const t = data;
      data = dataFim;
      dataFim = t;
    }
    if (dataFim === data) dataFim = null;

    const r = {
      id: Engine().uid("rest"),
      diaconoId: payload.diaconoId || sessao.diaconoId,
      data,
      dataFim: dataFim || null,
      tipo: payload.tipo,
      funcaoId: payload.funcaoId || null,
      horarioChegada: payload.horarioChegada || null,
      observacao: payload.observacao || "",
      motivoViagem: payload.motivoViagem || null,
      status: statusInicial === "aprovada" ? "pendente" : statusInicial,
      criadaEm: new Date().toISOString(),
      criadaPor: sessao.usuarioId,
      afetacoes: [],
    };

    if (!r.diaconoId) {
      return { ok: false, erro: "Selecione o diácono." };
    }
    if (!r.data) {
      return { ok: false, erro: "Informe a data." };
    }

    const dias = datasCobertas(r);
    const escalaExiste = dias.some((d) =>
      Engine().diaconoEstaEscaladoNaData(state, r.diaconoId, d)
    );

    state.restricoes.push(r);
    const periodo =
      r.dataFim && r.dataFim !== r.data
        ? `${r.data} a ${r.dataFim}`
        : r.data;
    Hist().add(state, {
      tipo: "restricao",
      mensagem: r.motivoViagem
        ? `${sessao.nome} informou ${labelMotivoViagem(r.motivoViagem)} (${periodo}).`
        : `Restrição cadastrada por ${sessao.nome} para ${periodo}.`,
      usuarioId: sessao.usuarioId,
      meta: { restricaoId: r.id },
    });

    let whatsapp = null;
    if (typeof window.DiaconiaWhatsApp?.notificarAvisoRestricao === "function") {
      const dNome =
        state.diaconos.find((d) => d.id === r.diaconoId)?.nome || sessao.nome;
      whatsapp = window.DiaconiaWhatsApp.notificarAvisoRestricao(state, r, {
        diaconoNome: dNome,
      });
    }

    let afetacoes = [];
    if (statusInicial === "aprovada") {
      const apr = setStatus(state, r.id, "aprovada", sessao);
      afetacoes = apr.restricao?.afetacoes || [];
    }

    return {
      ok: true,
      restricao: r,
      alertaEscalaExistente: escalaExiste,
      afetacoes,
      whatsapp,
    };
  }

  /**
   * Viagem (trabalho/familiar): período indisponível, já considerado na geração da escala.
   */
  function criarViagem(state, payload, sessao) {
    const motivo = payload.motivoViagem === "familiar" ? "familiar" : "trabalho";
    const inicio = payload.data || payload.dataInicio;
    if (!inicio) return { ok: false, erro: "Informe a data de início." };
    const qtd = Math.max(1, Math.min(365, Number(payload.qtdDias) || 1));
    const fim = Cal().fimPorQtdDias(inicio, qtd);
    const rotulo = labelMotivoViagem(motivo);
    const obsExtra = payload.observacao?.trim() || "";
    const observacao = [
      `Viagem ${motivo === "trabalho" ? "a trabalho" : "familiar"} (${qtd} dia${qtd > 1 ? "s" : ""})`,
      obsExtra,
    ]
      .filter(Boolean)
      .join(" — ");

    return criar(
      state,
      {
        diaconoId: payload.diaconoId || sessao.diaconoId,
        data: inicio,
        dataFim: fim,
        qtdDias: qtd,
        tipo: "indisponivel",
        motivoViagem: motivo,
        observacao,
        aprovarAgora: true,
      },
      sessao
    );
  }

  function setStatus(state, restricaoId, status, sessao) {
    const r = state.restricoes.find((x) => x.id === restricaoId);
    if (!r) return { ok: false, erro: "Restrição não encontrada." };
    const datasAntes = datasCobertas(r);
    r.status = status;
    r.revisadaEm = new Date().toISOString();
    r.revisadaPor = sessao.usuarioId;

    if (status === "aprovada") {
      recomputarDatas(state, datasCobertas(r));
    } else {
      r.afetacoes = [];
      recomputarDatas(state, datasAntes);
    }

    Hist().add(state, {
      tipo: "restricao",
      mensagem: `Restrição ${restricaoId} marcada como ${status}.`,
      usuarioId: sessao.usuarioId,
    });

    const user = state.usuarios.find((u) => u.diaconoId === r.diaconoId);
    if (user) {
      const periodo =
        r.dataFim && r.dataFim !== r.data
          ? `${r.data} a ${r.dataFim}`
          : r.data;
      if (status === "rejeitada") {
        Hist().notify(state, {
          usuarioId: user.id,
          titulo: "Sobre seu aviso",
          corpo: `Para ${periodo}, sua escala no diaconato permanece como está. Fale com a liderança se precisar.`,
          link: "?ir=avisos",
        });
      } else if (status === "aprovada") {
        Hist().notify(state, {
          usuarioId: user.id,
          titulo: r.motivoViagem ? "Viagem registrada" : "Aviso confirmado",
          corpo: r.motivoViagem
            ? `Seu período de ${labelMotivoViagem(r.motivoViagem)} (${periodo}) já vale para a geração da escala.`
            : `Seu aviso de ${periodo} foi confirmado pela liderança.`,
          link: "?ir=avisos",
        });
      } else {
        Hist().notify(state, {
          usuarioId: user.id,
          titulo: `Restrição ${status}`,
          corpo: `Sua restrição de ${periodo} foi ${status}.`,
        });
      }
    }

    let whatsapp = null;
    if (
      (status === "aprovada" || status === "rejeitada") &&
      typeof window.DiaconiaWhatsApp?.notificarStatusRestricao === "function"
    ) {
      whatsapp = window.DiaconiaWhatsApp.notificarStatusRestricao(state, r, { status });
    }

    return { ok: true, restricao: r, whatsapp };
  }

  function atualizar(state, restricaoId, payload, sessao) {
    const r = state.restricoes.find((x) => x.id === restricaoId);
    if (!r) return { ok: false, erro: "Restrição não encontrada." };

    const datasAntes = datasCobertas(r);

    if (payload.diaconoId) r.diaconoId = payload.diaconoId;
    if (payload.data) r.data = payload.data;
    if (payload.dataFim !== undefined) r.dataFim = payload.dataFim || null;
    if (payload.qtdDias && r.data) {
      r.dataFim = Cal().fimPorQtdDias(r.data, payload.qtdDias);
      if (r.dataFim === r.data) r.dataFim = null;
    }
    if (payload.tipo) r.tipo = payload.tipo;
    if (payload.motivoViagem !== undefined) r.motivoViagem = payload.motivoViagem || null;
    r.funcaoId = payload.tipo === "funcao" ? payload.funcaoId || null : null;
    r.horarioChegada = payload.tipo === "horario" ? payload.horarioChegada || null : null;
    if (payload.observacao !== undefined) r.observacao = payload.observacao;
    r.atualizadaEm = new Date().toISOString();
    r.atualizadaPor = sessao.usuarioId;

    if (payload.status) {
      return setStatus(state, restricaoId, payload.status, sessao);
    }

    if (r.status === "aprovada") {
      recomputarDatas(state, [...datasAntes, ...datasCobertas(r)]);
    }

    Hist().add(state, {
      tipo: "restricao",
      mensagem: `Restrição ${restricaoId} editada (${r.data}${r.dataFim ? ` a ${r.dataFim}` : ""}).`,
      usuarioId: sessao.usuarioId,
    });

    return { ok: true, restricao: r, afetacoes: r.afetacoes || [] };
  }

  function excluir(state, restricaoId, sessao) {
    const idx = state.restricoes.findIndex((x) => x.id === restricaoId);
    if (idx < 0) return { ok: false, erro: "Restrição não encontrada." };
    const [r] = state.restricoes.splice(idx, 1);
    const datas = datasCobertas(r);

    if (r.status === "aprovada") {
      recomputarDatas(state, datas);
    }

    Hist().add(state, {
      tipo: "restricao",
      mensagem: `Restrição excluída: ${r.data}${r.dataFim ? ` a ${r.dataFim}` : ""} (${r.diaconoId}).`,
      usuarioId: sessao.usuarioId,
    });

    return { ok: true, restricao: r };
  }

  return { criar, criarViagem, setStatus, atualizar, excluir, recomputarAlertaData, labelMotivoViagem };
})();
