window.DiaconiaSwaps = (() => {
  const Engine = () => window.DiaconiaEngine;
  const Hist = () => window.DiaconiaHistory;

  function localizarFuncaoDoDia(escala, diaconoId, fallbackEquipeId) {
    let funcaoAlvo = null;
    let equipeAlvo = fallbackEquipeId;
    for (const [eq, funcoes] of Object.entries(escala.atribuicoes || {})) {
      for (const [fid, lista] of Object.entries(funcoes)) {
        if ((lista || []).includes(diaconoId)) {
          funcaoAlvo = fid;
          equipeAlvo = eq;
        }
      }
    }
    return { funcaoAlvo, equipeAlvo };
  }

  function montarTroca(state, payload) {
    const { data, equipeId, funcaoId, paraDiaconoId } = payload;
    const deDiaconoId = payload.deDiaconoId;
    const modalidade = payload.modalidade === "cobertura" ? "cobertura" : "troca";

    if (!deDiaconoId) return { ok: false, erro: "Informe o diácono de origem." };
    if (!paraDiaconoId) return { ok: false, erro: "Informe o diácono destino." };
    if (deDiaconoId === paraDiaconoId) {
      return { ok: false, erro: "Escolha duas pessoas diferentes." };
    }

    const escala = state.escalas[data];
    if (!escala) return { ok: false, erro: "Escala não encontrada." };

    const ids = escala.atribuicoes?.[equipeId]?.[funcaoId] || [];
    if (!ids.includes(deDiaconoId)) {
      return { ok: false, erro: "O diácono de origem não está nesta função nesta data." };
    }
    if (ids.includes(paraDiaconoId)) {
      return { ok: false, erro: "Os dois já estão nesta função." };
    }

    const origem = state.diaconos.find((d) => d.id === deDiaconoId);
    const alvo = state.diaconos.find((d) => d.id === paraDiaconoId);
    if (!origem || !alvo) return { ok: false, erro: "Diácono destino inválido." };
    if (alvo.ativo === false) return { ok: false, erro: "O diácono destino está inativo." };

    const { funcaoAlvo, equipeAlvo } = localizarFuncaoDoDia(escala, paraDiaconoId, equipeId);

    // Cobertura: quem cobre pode ser da mesma ou de outra equipe (mesmo sem estar escalado no dia)
    if (modalidade === "cobertura") {
      if (!Engine().candidatoValido(state, alvo, data, funcaoId, new Set())) {
        return {
          ok: false,
          erro: `${alvo.nome} não pode cobrir esta função nesta data (restrição, horário ou permissão).`,
        };
      }
    }

    return {
      ok: true,
      troca: {
        id: Engine().uid("troca"),
        modalidade,
        data,
        deDiaconoId,
        paraDiaconoId,
        equipeId,
        funcaoId,
        equipeAlvo,
        funcaoAlvo,
        status: "aguardando_aceite",
        criadaEm: new Date().toISOString(),
      },
    };
  }

  function capturarSnapshotEscala(state, data) {
    const esc = state.escalas[data];
    if (!esc?.atribuicoes) return null;
    return JSON.parse(JSON.stringify(esc.atribuicoes));
  }

  function reverterSnapshotEscala(state, data, snapshot) {
    const esc = state.escalas[data];
    if (!esc || !snapshot) return;
    esc.atribuicoes = JSON.parse(JSON.stringify(snapshot));
    esc.status = Engine().statusEscala(esc, state);
  }

  function solicitar(state, payload, sessao) {
    const montado = montarTroca(state, {
      ...payload,
      deDiaconoId: payload.deDiaconoId || sessao.diaconoId,
    });
    if (!montado.ok) {
      if (
        montado.erro === "O diácono de origem não está nesta função nesta data." &&
        sessao.diaconoId
      ) {
        return { ok: false, erro: "Você não está nesta função nesta data." };
      }
      return montado;
    }

    const troca = montado.troca;
    const snapshot = capturarSnapshotEscala(state, troca.data);
    const aplicado = aplicarNaEscala(state, troca);
    if (!aplicado.ok) return aplicado;

    troca.escalaSnapshot = snapshot;
    troca.escalaAplicada = true;

    state.trocas.push(troca);
    const rotulo = troca.modalidade === "cobertura" ? "cobertura" : "troca";
    Hist().add(state, {
      tipo: "troca",
      mensagem: `${sessao.nome} solicitou ${rotulo} em ${payload.data} — nomes atualizados na escala (aguardando aceite).`,
      usuarioId: sessao.usuarioId,
      meta: { trocaId: troca.id },
    });

    const userAlvo = state.usuarios.find((u) => u.diaconoId === troca.paraDiaconoId);
    if (userAlvo) {
      const fn = Engine().getFuncao(state, troca.funcaoId);
      const fnNome = fn ? `${fn.emoji || ""} ${fn.nome}`.trim() : troca.funcaoId;
      Hist().notify(state, {
        usuarioId: userAlvo.id,
        titulo: troca.modalidade === "cobertura" ? "Pedido de cobertura" : "Solicitação de troca",
        corpo:
          troca.modalidade === "cobertura"
            ? `${sessao.nome} pediu para você cobrir ${fnNome} em ${payload.data}. A escala já mostra seu nome — confirme ou recuse em Avisos.`
            : `${sessao.nome} pediu troca de ${fnNome} em ${payload.data}. A escala já foi ajustada — confirme ou recuse em Avisos.`,
        link: "?ir=avisos",
        meta: { tipo: "troca_pendente", trocaId: troca.id },
      });
    }

    let whatsapp = null;
    if (typeof window.DiaconiaWhatsApp?.notificarPedidoTroca === "function") {
      whatsapp = window.DiaconiaWhatsApp.notificarPedidoTroca(state, troca, {
        deNome: sessao.nome,
      });
    }

    return { ok: true, troca, whatsapp };
  }

  function aceitar(state, trocaId, sessao) {
    const t = state.trocas.find((x) => x.id === trocaId);
    if (!t) return { ok: false, erro: "Registro não encontrado." };
    if (t.paraDiaconoId !== sessao.diaconoId) {
      return { ok: false, erro: "Somente o diácono convidado pode aceitar." };
    }
    if (t.status !== "aguardando_aceite") {
      return { ok: false, erro: "Este pedido não está aguardando aceite." };
    }

    if (!t.escalaAplicada) {
      const aplicado = aplicarNaEscala(state, t);
      if (!aplicado.ok) return aplicado;
    }

    t.status = "aprovada";
    t.aceitaEm = new Date().toISOString();
    t.aprovadaEm = new Date().toISOString();
    t.aprovadaPor = sessao.usuarioId;
    delete t.escalaSnapshot;

    const a = state.diaconos.find((d) => d.id === t.deDiaconoId);
    const b = state.diaconos.find((d) => d.id === t.paraDiaconoId);
    const rotulo = t.modalidade === "cobertura" ? "Cobertura" : "Troca";
    const seta = t.modalidade === "cobertura" ? "← cobriu" : "↔";
    Hist().add(state, {
      tipo: "troca",
      mensagem: `${rotulo} confirmada em ${t.data}: ${a?.nome || "?"} ${seta} ${b?.nome || "?"}.`,
      usuarioId: sessao.usuarioId,
      meta: { trocaId: t.id },
    });

    for (const did of [t.deDiaconoId, t.paraDiaconoId]) {
      const u = state.usuarios.find((x) => x.diaconoId === did);
      if (!u) continue;
      const souAlvo = did === t.paraDiaconoId;
      Hist().notify(state, {
        usuarioId: u.id,
        titulo: `${rotulo} confirmada`,
        corpo: souAlvo
          ? `Você confirmou o pedido de ${t.data}. A escala permanece atualizada.`
          : `${b?.nome || "O diácono"} confirmou seu pedido de ${t.data}.`,
        meta: { tipo: "troca_concluida", trocaId: t.id },
      });
    }

    let whatsapp = null;
    if (typeof window.DiaconiaWhatsApp?.notificarRespostaTroca === "function") {
      whatsapp = window.DiaconiaWhatsApp.notificarRespostaTroca(state, t, {
        aceita: true,
        porNome: sessao.nome,
      });
    }

    return { ok: true, troca: t, whatsapp };
  }

  function recusar(state, trocaId, sessao) {
    const t = state.trocas.find((x) => x.id === trocaId);
    if (!t) return { ok: false, erro: "Registro não encontrado." };
    if (t.paraDiaconoId !== sessao.diaconoId && t.deDiaconoId !== sessao.diaconoId) {
      return { ok: false, erro: "Sem permissão para recusar este pedido." };
    }
    if (t.escalaAplicada && t.escalaSnapshot) {
      reverterSnapshotEscala(state, t.data, t.escalaSnapshot);
    }
    t.status = "recusada";
    t.recusadaEm = new Date().toISOString();
    t.escalaAplicada = false;
    delete t.escalaSnapshot;
    Hist().add(state, {
      tipo: "troca",
      mensagem: `${t.modalidade === "cobertura" ? "Cobertura" : "Troca"} ${trocaId} recusada — escala restaurada.`,
      usuarioId: sessao.usuarioId,
    });

    const userPediu = state.usuarios.find((u) => u.diaconoId === t.deDiaconoId);
    if (userPediu) {
      Hist().notify(state, {
        usuarioId: userPediu.id,
        titulo: "Pedido recusado",
        corpo: `${sessao.nome} recusou seu pedido de ${t.data}. Sua escala voltou ao normal.`,
        link: "?ir=avisos",
        meta: { tipo: "troca_recusada", trocaId: t.id },
      });
    }

    let whatsapp = null;
    if (typeof window.DiaconiaWhatsApp?.notificarRespostaTroca === "function") {
      whatsapp = window.DiaconiaWhatsApp.notificarRespostaTroca(state, t, {
        aceita: false,
        porNome: sessao.nome,
      });
    }

    return { ok: true, troca: t, whatsapp };
  }

  function atualizar(state, trocaId, payload, sessao) {
    const t = state.trocas.find((x) => x.id === trocaId);
    if (!t) return { ok: false, erro: "Registro não encontrado." };
    if (t.deDiaconoId !== sessao.diaconoId) {
      return { ok: false, erro: "Somente quem solicitou pode editar." };
    }
    if (t.status !== "aguardando_aceite") {
      return { ok: false, erro: "Só é possível editar pedidos aguardando aceite." };
    }

    if (t.escalaAplicada && t.escalaSnapshot) {
      reverterSnapshotEscala(state, t.data, t.escalaSnapshot);
      t.escalaAplicada = false;
      delete t.escalaSnapshot;
    }

    const antigoPara = t.paraDiaconoId;
    const montado = montarTroca(state, {
      ...payload,
      deDiaconoId: t.deDiaconoId,
    });
    if (!montado.ok) return montado;

    Object.assign(t, {
      modalidade: montado.troca.modalidade,
      data: montado.troca.data,
      equipeId: montado.troca.equipeId,
      funcaoId: montado.troca.funcaoId,
      paraDiaconoId: montado.troca.paraDiaconoId,
      equipeAlvo: montado.troca.equipeAlvo,
      funcaoAlvo: montado.troca.funcaoAlvo,
      atualizadaEm: new Date().toISOString(),
    });

    const snapshot = capturarSnapshotEscala(state, t.data);
    const aplicado = aplicarNaEscala(state, t);
    if (!aplicado.ok) return aplicado;
    t.escalaSnapshot = snapshot;
    t.escalaAplicada = true;

    const rotulo = t.modalidade === "cobertura" ? "cobertura" : "troca";
    Hist().add(state, {
      tipo: "troca",
      mensagem: `${sessao.nome} atualizou o pedido de ${rotulo} em ${t.data}.`,
      usuarioId: sessao.usuarioId,
      meta: { trocaId: t.id },
    });

    if (antigoPara !== t.paraDiaconoId) {
      const fn = Engine().getFuncao(state, t.funcaoId);
      const fnNome = fn ? `${fn.emoji || ""} ${fn.nome}`.trim() : t.funcaoId;
      const userAlvo = state.usuarios.find((u) => u.diaconoId === t.paraDiaconoId);
      if (userAlvo) {
        Hist().notify(state, {
          usuarioId: userAlvo.id,
          titulo: t.modalidade === "cobertura" ? "Pedido de cobertura" : "Solicitação de troca",
          corpo:
            t.modalidade === "cobertura"
              ? `${sessao.nome} pediu para você cobrir ${fnNome} em ${t.data}.`
              : `${sessao.nome} pediu troca de ${fnNome} em ${t.data}.`,
          meta: { tipo: "troca_pendente", trocaId: t.id },
        });
      }
    }

    return { ok: true, troca: t };
  }

  function excluir(state, trocaId, sessao) {
    const t = state.trocas.find((x) => x.id === trocaId);
    if (!t) return { ok: false, erro: "Registro não encontrado." };
    if (t.deDiaconoId !== sessao.diaconoId) {
      return { ok: false, erro: "Somente quem solicitou pode excluir." };
    }
    if (t.status === "aprovada" && !t.escalaAplicada) {
      return {
        ok: false,
        erro: "Não é possível excluir uma troca já confirmada. A escala já foi atualizada.",
      };
    }
    if (t.status === "aprovada" && t.escalaAplicada) {
      return {
        ok: false,
        erro: "Não é possível excluir — o pedido já foi confirmado.",
      };
    }

    if (t.escalaAplicada && t.escalaSnapshot) {
      reverterSnapshotEscala(state, t.data, t.escalaSnapshot);
    }

    state.trocas = (state.trocas || []).filter((x) => x.id !== trocaId);
    state.notificacoes = (state.notificacoes || []).filter((n) => n.meta?.trocaId !== trocaId);

    Hist().add(state, {
      tipo: "troca",
      mensagem: `${sessao.nome} excluiu o pedido de ${t.modalidade === "cobertura" ? "cobertura" : "troca"} em ${t.data}.`,
      usuarioId: sessao.usuarioId,
    });

    return { ok: true };
  }

  /**
   * troca: se B já tem função no dia, troca as funções; senão B assume e A sai.
   * cobertura: B assume a função de A; A sai; se B já tinha função no dia, deixa a antiga (não herda A).
   */
  function aplicarNaEscala(state, t) {
    const escala = state.escalas[t.data];
    if (!escala) return { ok: false, erro: "Escala não encontrada." };

    const a = state.diaconos.find((d) => d.id === t.deDiaconoId);
    const b = state.diaconos.find((d) => d.id === t.paraDiaconoId);
    if (!a || !b) return { ok: false, erro: "Diácono inválido." };

    const atr = escala.atribuicoes || (escala.atribuicoes = {});
    if (!atr[t.equipeId]) atr[t.equipeId] = {};

    const modalidade = t.modalidade === "cobertura" ? "cobertura" : "troca";

    if (modalidade === "cobertura") {
      if (!Engine().candidatoValido(state, b, t.data, t.funcaoId, new Set())) {
        return { ok: false, erro: `${b.nome} não pode cobrir esta função.` };
      }
      // Remove B de qualquer outra função no dia (pode vir de outra equipe)
      for (const funcoes of Object.values(atr)) {
        for (const fid of Object.keys(funcoes)) {
          funcoes[fid] = (funcoes[fid] || []).filter((id) => id !== t.paraDiaconoId);
        }
      }
      const listaA = atr[t.equipeId][t.funcaoId] || [];
      atr[t.equipeId][t.funcaoId] = listaA.map((id) =>
        id === t.deDiaconoId ? t.paraDiaconoId : id
      );
      // A sai e não assume a função antiga de B
    } else if (t.funcaoAlvo) {
      if (!atr[t.equipeAlvo]) atr[t.equipeAlvo] = {};
      const listaA = atr[t.equipeId][t.funcaoId] || [];
      const listaB = atr[t.equipeAlvo][t.funcaoAlvo] || [];

      if (!Engine().candidatoValido(state, b, t.data, t.funcaoId, new Set())) {
        return { ok: false, erro: `${b.nome} não pode assumir a função de origem.` };
      }
      if (!Engine().candidatoValido(state, a, t.data, t.funcaoAlvo, new Set())) {
        return { ok: false, erro: `${a.nome} não pode assumir a função de destino.` };
      }

      atr[t.equipeId][t.funcaoId] = listaA.map((id) =>
        id === t.deDiaconoId ? t.paraDiaconoId : id
      );
      atr[t.equipeAlvo][t.funcaoAlvo] = listaB.map((id) =>
        id === t.paraDiaconoId ? t.deDiaconoId : id
      );
    } else {
      if (!Engine().candidatoValido(state, b, t.data, t.funcaoId, new Set())) {
        return { ok: false, erro: `${b.nome} não pode assumir esta função.` };
      }
      for (const funcoes of Object.values(atr)) {
        for (const fid of Object.keys(funcoes)) {
          funcoes[fid] = (funcoes[fid] || []).filter((id) => id !== t.paraDiaconoId);
        }
      }
      const listaA = atr[t.equipeId][t.funcaoId] || [];
      atr[t.equipeId][t.funcaoId] = listaA.map((id) =>
        id === t.deDiaconoId ? t.paraDiaconoId : id
      );
    }

    escala.status = Engine().statusEscala(escala, state);
    return { ok: true, escala, a, b, modalidade };
  }

  function aprovar(state, trocaId, sessao) {
    const t = state.trocas.find((x) => x.id === trocaId);
    if (!t) return { ok: false, erro: "Registro não encontrado." };
    if (t.status !== "aguardando_lider") {
      return { ok: false, erro: "Pedido precisa estar aceito pelo diácono." };
    }

    const aplicado = aplicarNaEscala(state, t);
    if (!aplicado.ok) return aplicado;

    t.status = "aprovada";
    t.aprovadaEm = new Date().toISOString();
    t.aprovadaPor = sessao.usuarioId;

    const seta = t.modalidade === "cobertura" ? "← cobriu" : "↔";
    Hist().add(state, {
      tipo: "troca",
      mensagem: `${t.modalidade === "cobertura" ? "Cobertura" : "Troca"} aprovada em ${t.data}: ${aplicado.a.nome} ${seta} ${aplicado.b.nome}.`,
      usuarioId: sessao.usuarioId,
    });

    for (const did of [t.deDiaconoId, t.paraDiaconoId]) {
      const u = state.usuarios.find((x) => x.diaconoId === did);
      if (u) {
        Hist().notify(state, {
          usuarioId: u.id,
          titulo: t.modalidade === "cobertura" ? "Cobertura confirmada" : "Troca confirmada",
          corpo: `O pedido de ${t.data} foi confirmado. Sua escala foi atualizada.`,
        });
      }
    }

    return { ok: true, troca: t };
  }

  /**
   * Migra pedidos antigos "aguardando_lider": aplica na escala e marca como confirmados.
   * Troca/cobertura não exige mais aprovação da liderança.
   */
  function concluirPendentesSemLider(state) {
    const sessao = { usuarioId: "sistema", nome: "Sistema" };
    let n = 0;
    for (const t of state.trocas || []) {
      if (t.status !== "aguardando_lider") continue;
      const res = aprovar(state, t.id, sessao);
      if (res.ok) {
        n += 1;
        continue;
      }
      // Se a escala já mudou ou não dá para aplicar, só fecha o status
      t.status = "aprovada";
      t.aprovadaEm = t.aprovadaEm || new Date().toISOString();
      t.aprovadaPor = sessao.usuarioId;
      t.migradoSemLider = true;
      n += 1;
    }
    return n;
  }

  function executarPeloLider(state, payload, sessao) {
    const montado = montarTroca(state, payload);
    if (!montado.ok) return montado;

    const troca = montado.troca;
    const aplicado = aplicarNaEscala(state, troca);
    if (!aplicado.ok) return aplicado;

    troca.status = "aprovada";
    troca.origem = "lider";
    troca.aceitaEm = new Date().toISOString();
    troca.aprovadaEm = new Date().toISOString();
    troca.aprovadaPor = sessao.usuarioId;
    state.trocas.push(troca);

    const rotulo = troca.modalidade === "cobertura" ? "Cobertura" : "Troca";
    Hist().add(state, {
      tipo: "troca",
      mensagem: `${rotulo} registrada pela liderança em ${troca.data}: ${aplicado.a.nome} → ${aplicado.b.nome}.`,
      usuarioId: sessao.usuarioId,
      meta: { trocaId: troca.id },
    });

    for (const did of [troca.deDiaconoId, troca.paraDiaconoId]) {
      const u = state.usuarios.find((x) => x.diaconoId === did);
      if (u) {
        Hist().notify(state, {
          usuarioId: u.id,
          titulo: `${rotulo} na escala`,
          corpo: `A liderança registrou uma ${rotulo.toLowerCase()} em ${troca.data}: ${aplicado.a.nome} → ${aplicado.b.nome}.`,
        });
      }
    }

    return { ok: true, troca };
  }

  function rejeitar(state, trocaId, sessao) {
    const t = state.trocas.find((x) => x.id === trocaId);
    if (!t) return { ok: false, erro: "Registro não encontrado." };
    if (t.status === "aprovada") {
      return { ok: false, erro: "Pedido já confirmado — a escala já foi atualizada." };
    }
    // Recusa da liderança não altera a escala (só encerra o pedido).
    t.status = "rejeitada";
    t.rejeitadaEm = new Date().toISOString();
    Hist().add(state, {
      tipo: "troca",
      mensagem: `${t.modalidade === "cobertura" ? "Cobertura" : "Troca"} ${trocaId} rejeitada pelo líder.`,
      usuarioId: sessao.usuarioId,
    });

    for (const did of [t.deDiaconoId, t.paraDiaconoId]) {
      const u = state.usuarios.find((x) => x.diaconoId === did);
      if (!u) continue;
      Hist().notify(state, {
        usuarioId: u.id,
        titulo: "Pedido encerrado",
        corpo: `O pedido de ${t.data} foi encerrado pela liderança. Sua escala permanece como está.`,
        link: "?ir=avisos",
      });
    }

    return { ok: true, troca: t };
  }

  return { solicitar, aceitar, recusar, atualizar, excluir, aprovar, rejeitar, executarPeloLider, concluirPendentesSemLider };
})();
