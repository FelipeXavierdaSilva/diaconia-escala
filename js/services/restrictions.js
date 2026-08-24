window.DiaconiaRestrictions = (() => {
  const Engine = () => window.DiaconiaEngine;
  const Hist = () => window.DiaconiaHistory;

  function criar(state, payload, sessao) {
    const statusInicial =
      payload.status || (payload.aprovarAgora ? "aprovada" : "pendente");

    const r = {
      id: Engine().uid("rest"),
      diaconoId: payload.diaconoId || sessao.diaconoId,
      data: payload.data,
      tipo: payload.tipo,
      funcaoId: payload.funcaoId || null,
      horarioChegada: payload.horarioChegada || null,
      observacao: payload.observacao || "",
      status: statusInicial === "aprovada" ? "pendente" : statusInicial,
      criadaEm: new Date().toISOString(),
      criadaPor: sessao.usuarioId,
      afetacoes: [],
    };

    if (!r.diaconoId) {
      return { ok: false, erro: "Selecione o diácono." };
    }

    const escalaExiste = Engine().diaconoEstaEscaladoNaData(state, r.diaconoId, r.data);

    state.restricoes.push(r);
    Hist().add(state, {
      tipo: "restricao",
      mensagem: `Restrição cadastrada por ${sessao.nome} para ${r.data}.`,
      usuarioId: sessao.usuarioId,
      meta: { restricaoId: r.id },
    });

    // Preparado para futuro: notificar líderes via WhatsApp (desligado por padrão nas config)
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

  function setStatus(state, restricaoId, status, sessao) {
    const r = state.restricoes.find((x) => x.id === restricaoId);
    if (!r) return { ok: false, erro: "Restrição não encontrada." };
    r.status = status;
    r.revisadaEm = new Date().toISOString();
    r.revisadaPor = sessao.usuarioId;

    if (status === "aprovada") {
      r.afetacoes = Engine().escalasAfetadasPorRestricao(state, r);
      if (r.afetacoes.length) {
        const esc = state.escalas[r.data];
        if (esc) {
          esc.status = "afetada";
          esc.alertaAfetacao = {
            restricaoId: r.id,
            diaconoId: r.diaconoId,
            mensagem: "Escala afetada por nova restrição aprovada.",
          };
        }
      }
    } else {
      r.afetacoes = [];
      const esc = state.escalas[r.data];
      if (esc?.alertaAfetacao?.restricaoId === restricaoId) {
        delete esc.alertaAfetacao;
        esc.status = Engine().statusEscala(esc, state);
      }
    }

    Hist().add(state, {
      tipo: "restricao",
      mensagem: `Restrição ${restricaoId} marcada como ${status}.`,
      usuarioId: sessao.usuarioId,
    });

    const user = state.usuarios.find((u) => u.diaconoId === r.diaconoId);
    if (user) {
      if (status === "rejeitada") {
        Hist().notify(state, {
          usuarioId: user.id,
          titulo: "Sobre seu aviso",
          corpo: `Para ${r.data}, sua escala no diaconato permanece como está. Fale com a liderança se precisar.`,
          link: "?ir=avisos",
        });
      } else if (status === "aprovada") {
        Hist().notify(state, {
          usuarioId: user.id,
          titulo: "Aviso confirmado",
          corpo: `Seu aviso de ${r.data} foi confirmado pela liderança.`,
          link: "?ir=avisos",
        });
      } else {
        Hist().notify(state, {
          usuarioId: user.id,
          titulo: `Restrição ${status}`,
          corpo: `Sua restrição de ${r.data} foi ${status}.`,
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

    if (payload.diaconoId) r.diaconoId = payload.diaconoId;
    if (payload.data) r.data = payload.data;
    if (payload.tipo) r.tipo = payload.tipo;
    r.funcaoId = payload.tipo === "funcao" ? payload.funcaoId || null : null;
    r.horarioChegada = payload.tipo === "horario" ? payload.horarioChegada || null : null;
    if (payload.observacao !== undefined) r.observacao = payload.observacao;
    r.atualizadaEm = new Date().toISOString();
    r.atualizadaPor = sessao.usuarioId;

    if (payload.status) {
      return setStatus(state, restricaoId, payload.status, sessao);
    }

    if (r.status === "aprovada") {
      r.afetacoes = Engine().escalasAfetadasPorRestricao(state, r);
      if (r.afetacoes.length) {
        const esc = state.escalas[r.data];
        if (esc) {
          esc.status = "afetada";
          esc.alertaAfetacao = {
            restricaoId: r.id,
            diaconoId: r.diaconoId,
            mensagem: "Escala afetada por restrição editada.",
          };
        }
      }
    }

    Hist().add(state, {
      tipo: "restricao",
      mensagem: `Restrição ${restricaoId} editada (${r.data}).`,
      usuarioId: sessao.usuarioId,
    });

    return { ok: true, restricao: r, afetacoes: r.afetacoes || [] };
  }

  function excluir(state, restricaoId, sessao) {
    const idx = state.restricoes.findIndex((x) => x.id === restricaoId);
    if (idx < 0) return { ok: false, erro: "Restrição não encontrada." };
    const [r] = state.restricoes.splice(idx, 1);

    if (r.status === "aprovada") {
      const esc = state.escalas[r.data];
      if (esc?.alertaAfetacao?.restricaoId === restricaoId) {
        delete esc.alertaAfetacao;
        esc.status = Engine().statusEscala(esc, state);
      }
    }

    Hist().add(state, {
      tipo: "restricao",
      mensagem: `Restrição excluída: ${r.data} (${r.diaconoId}).`,
      usuarioId: sessao.usuarioId,
    });

    return { ok: true, restricao: r };
  }

  return { criar, setStatus, atualizar, excluir };
})();
