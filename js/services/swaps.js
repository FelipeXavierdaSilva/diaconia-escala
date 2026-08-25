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

  function slotsDoDiaconoNaEscala(escala, diaconoId) {
    const slots = [];
    for (const [eq, funcoes] of Object.entries(escala?.atribuicoes || {})) {
      for (const [fid, lista] of Object.entries(funcoes || {})) {
        if ((lista || []).includes(diaconoId)) {
          slots.push({ equipeId: eq, funcaoId: fid });
        }
      }
    }
    return slots;
  }

  function nomeUmaFuncao(state, funcaoId) {
    const fn = Engine().getFuncao(state, funcaoId);
    return fn ? `${fn.emoji || ""} ${fn.nome}`.trim() : funcaoId || "—";
  }

  function nomesUnicosSlots(state, slots) {
    const nomes = [];
    const seen = new Set();
    for (const s of slots || []) {
      const id = s.funcaoId;
      if (!id || seen.has(id)) continue;
      seen.add(id);
      nomes.push(nomeUmaFuncao(state, id));
    }
    return nomes;
  }

  function nomesFuncoesTroca(state, troca) {
    if (troca?.modalidade !== "cobertura") {
      const origem =
        Array.isArray(troca?.slotsOrigem) && troca.slotsOrigem.length
          ? troca.slotsOrigem
          : troca?.funcaoId
            ? [{ funcaoId: troca.funcaoId }]
            : [];
      const alvo = Array.isArray(troca?.slotsAlvo) ? troca.slotsAlvo : [];
      const a = nomesUnicosSlots(state, origem);
      const b = nomesUnicosSlots(state, alvo);
      if (b.length) return `${a.join(", ")} ↔ ${b.join(", ")}`;
      return a.join(", ");
    }
    const slots =
      Array.isArray(troca?.slotsCobertura) && troca.slotsCobertura.length
        ? troca.slotsCobertura
        : troca?.funcaoId
          ? [{ funcaoId: troca.funcaoId }]
          : [];
    return nomesUnicosSlots(state, slots).join(", ");
  }

  function resumoTrocaMultifuncao(state, t) {
    const escala = state.escalas?.[t.data];
    const origem = Array.isArray(t.slotsOrigem)
      ? t.slotsOrigem
      : slotsDoDiaconoNaEscala(escala, t.deDiaconoId);
    const alvo = Array.isArray(t.slotsAlvo)
      ? t.slotsAlvo
      : slotsDoDiaconoNaEscala(escala, t.paraDiaconoId);
    const de = state.diaconos.find((d) => d.id === t.deDiaconoId);
    const para = state.diaconos.find((d) => d.id === t.paraDiaconoId);
    return {
      envolve: origem.length > 1 || alvo.length > 1,
      origem,
      alvo,
      nomesOrigem: nomesUnicosSlots(state, origem),
      nomesAlvo: nomesUnicosSlots(state, alvo),
      nomeDe: de?.nome || "Diácono",
      nomePara: para?.nome || "Diácono",
    };
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

    const origem = state.diaconos.find((d) => d.id === deDiaconoId);
    const alvo = state.diaconos.find((d) => d.id === paraDiaconoId);
    if (!origem || !alvo) return { ok: false, erro: "Diácono destino inválido." };
    if (alvo.ativo === false) return { ok: false, erro: "O diácono destino está inativo." };

    const { funcaoAlvo, equipeAlvo } = localizarFuncaoDoDia(escala, paraDiaconoId, equipeId);

    let slotsCobertura = null;
    let slotsOrigem = null;
    let slotsAlvo = null;
    let multifuncao = false;
    if (modalidade === "cobertura") {
      // Quem sai é substituído em todas as funções do culto, não só na selecionada.
      slotsCobertura = slotsDoDiaconoNaEscala(escala, deDiaconoId);
      const pendentes = slotsCobertura.filter((s) => {
        const lista = escala.atribuicoes?.[s.equipeId]?.[s.funcaoId] || [];
        return !lista.includes(paraDiaconoId);
      });
      if (!pendentes.length) {
        return { ok: false, erro: "Os dois já estão nas mesmas funções neste dia." };
      }
      for (const slot of pendentes) {
        if (!Engine().candidatoValido(state, alvo, data, slot.funcaoId, new Set(), { permitirReuso: true })) {
          return {
            ok: false,
            erro: `${alvo.nome} não pode cobrir ${nomeUmaFuncao(state, slot.funcaoId)} nesta data (restrição, horário ou permissão).`,
          };
        }
      }
    } else if (ids.includes(paraDiaconoId)) {
      return { ok: false, erro: "Os dois já estão nesta função." };
    } else {
      slotsOrigem = slotsDoDiaconoNaEscala(escala, deDiaconoId);
      slotsAlvo = slotsDoDiaconoNaEscala(escala, paraDiaconoId);
      multifuncao = slotsOrigem.length > 1 || slotsAlvo.length > 1;
      const opts = { permitirReuso: true };
      for (const slot of slotsOrigem) {
        const lista = escala.atribuicoes?.[slot.equipeId]?.[slot.funcaoId] || [];
        if (lista.includes(paraDiaconoId)) continue;
        if (!Engine().candidatoValido(state, alvo, data, slot.funcaoId, new Set(), opts)) {
          return {
            ok: false,
            erro: `${alvo.nome} não pode assumir ${nomeUmaFuncao(state, slot.funcaoId)} nesta data.`,
          };
        }
      }
      for (const slot of slotsAlvo) {
        const lista = escala.atribuicoes?.[slot.equipeId]?.[slot.funcaoId] || [];
        if (lista.includes(deDiaconoId)) continue;
        if (!Engine().candidatoValido(state, origem, data, slot.funcaoId, new Set(), opts)) {
          return {
            ok: false,
            erro: `${origem.nome} não pode assumir ${nomeUmaFuncao(state, slot.funcaoId)} nesta data.`,
          };
        }
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
        slotsCobertura,
        slotsOrigem,
        slotsAlvo,
        multifuncao,
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
    if (troca.multifuncao) {
      troca.escalaAplicada = false;
      troca.confirmadoOrigem = true;
    } else {
      const snapshot = capturarSnapshotEscala(state, troca.data);
      const aplicado = aplicarNaEscala(state, troca);
      if (!aplicado.ok) return aplicado;
      troca.escalaSnapshot = snapshot;
      troca.escalaAplicada = true;
    }

    state.trocas.push(troca);
    const rotulo = troca.modalidade === "cobertura" ? "cobertura" : "troca";
    Hist().add(state, {
      tipo: "troca",
      mensagem: troca.multifuncao
        ? `${sessao.nome} solicitou ${rotulo} em ${payload.data} com várias funções — aguardando confirmação dos dois (escala ainda não alterada).`
        : `${sessao.nome} solicitou ${rotulo} em ${payload.data} — nomes atualizados na escala (aguardando aceite).`,
      usuarioId: sessao.usuarioId,
      meta: { trocaId: troca.id },
    });

    const fnNome = nomesFuncoesTroca(state, troca);
    const variasCob = (troca.slotsCobertura || []).length > 1;
    const resumo = troca.multifuncao ? resumoTrocaMultifuncao(state, troca) : null;

    if (troca.multifuncao && resumo) {
      const detalhe = `${resumo.nomeDe}: ${resumo.nomesOrigem.join(", ") || "—"}. ${resumo.nomePara}: ${resumo.nomesAlvo.join(", ") || "livre neste dia"}.`;
      for (const did of [troca.deDiaconoId, troca.paraDiaconoId]) {
        const u = state.usuarios.find((x) => x.diaconoId === did);
        if (!u) continue;
        const souAlvo = did === troca.paraDiaconoId;
        Hist().notify(state, {
          usuarioId: u.id,
          titulo: souAlvo ? "Confirme a troca — várias funções" : "Pedido enviado — várias funções",
          corpo: souAlvo
            ? `${sessao.nome} pediu troca em ${payload.data}. ${detalhe} Se você aceitar, permutam todas as funções deste culto. Confirme em Avisos.`
            : `Você pediu troca em ${payload.data}. ${detalhe} A escala só muda quando ${resumo.nomePara} confirmar.`,
          link: "?ir=avisos",
          meta: { tipo: "troca_pendente", trocaId: troca.id, multifuncao: true },
        });
      }
    } else {
      const userAlvo = state.usuarios.find((u) => u.diaconoId === troca.paraDiaconoId);
      if (userAlvo) {
        Hist().notify(state, {
          usuarioId: userAlvo.id,
          titulo: troca.modalidade === "cobertura" ? "Pedido de cobertura" : "Solicitação de troca",
          corpo:
            troca.modalidade === "cobertura"
              ? `${sessao.nome} pediu para você cobrir ${fnNome} em ${payload.data}.${variasCob ? " São todas as funções dela neste culto." : ""} A escala já mostra seu nome — confirme ou recuse em Avisos.`
              : `${sessao.nome} pediu troca de ${fnNome} em ${payload.data}. A escala já foi ajustada — confirme ou recuse em Avisos.`,
          link: "?ir=avisos",
          meta: { tipo: "troca_pendente", trocaId: troca.id },
        });
      }
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
      t.escalaAplicada = true;
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
        corpo: t.multifuncao
          ? souAlvo
            ? `Você confirmou a troca de ${t.data}. As funções deste culto foram permutadas.`
            : `${b?.nome || "O diácono"} confirmou. A troca de ${t.data} foi aplicada na escala.`
          : souAlvo
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
    if (t.status !== "aguardando_aceite") {
      return { ok: false, erro: "Este pedido não está aguardando aceite." };
    }
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
      slotsCobertura: montado.troca.slotsCobertura,
      slotsOrigem: montado.troca.slotsOrigem,
      slotsAlvo: montado.troca.slotsAlvo,
      multifuncao: montado.troca.multifuncao,
      atualizadaEm: new Date().toISOString(),
    });

    if (t.multifuncao) {
      t.escalaAplicada = false;
      t.confirmadoOrigem = true;
      delete t.escalaSnapshot;
    } else {
      const snapshot = capturarSnapshotEscala(state, t.data);
      const aplicado = aplicarNaEscala(state, t);
      if (!aplicado.ok) return aplicado;
      t.escalaSnapshot = snapshot;
      t.escalaAplicada = true;
    }

    const rotulo = t.modalidade === "cobertura" ? "cobertura" : "troca";
    Hist().add(state, {
      tipo: "troca",
      mensagem: `${sessao.nome} atualizou o pedido de ${rotulo} em ${t.data}.`,
      usuarioId: sessao.usuarioId,
      meta: { trocaId: t.id },
    });

    if (antigoPara !== t.paraDiaconoId) {
      const fnNome = nomesFuncoesTroca(state, t);
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
   * troca: permuta as funções do dia (se alguém tem várias, permuta todas).
   * cobertura: B assume todas as funções de A neste culto; A fica fora do dia.
   *            Se B já tinha função, deixa a antiga (não herda a de A em troca).
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
      const slotsCompletos = Array.isArray(t.slotsCobertura) && t.slotsCobertura.length;
      const slots = slotsCompletos
        ? t.slotsCobertura
        : [{ equipeId: t.equipeId, funcaoId: t.funcaoId }];

      for (const slot of slots) {
        const lista = atr[slot.equipeId]?.[slot.funcaoId] || [];
        if (lista.includes(t.paraDiaconoId)) continue;
        if (!Engine().candidatoValido(state, b, t.data, slot.funcaoId, new Set(), { permitirReuso: true })) {
          return { ok: false, erro: `${b.nome} não pode cobrir ${nomeUmaFuncao(state, slot.funcaoId)}.` };
        }
      }

      const chavesSlots = new Set(slots.map((s) => `${s.equipeId}|${s.funcaoId}`));

      // B deixa funções que não vai herdar de A
      for (const [eq, funcoes] of Object.entries(atr)) {
        for (const fid of Object.keys(funcoes)) {
          if (chavesSlots.has(`${eq}|${fid}`)) continue;
          funcoes[fid] = (funcoes[fid] || []).filter((id) => id !== t.paraDiaconoId);
        }
      }
      for (const slot of slots) {
        if (!atr[slot.equipeId]) atr[slot.equipeId] = {};
        const listaA = atr[slot.equipeId][slot.funcaoId] || [];
        if (listaA.includes(t.paraDiaconoId)) {
          atr[slot.equipeId][slot.funcaoId] = listaA.filter((id) => id !== t.deDiaconoId);
        } else {
          atr[slot.equipeId][slot.funcaoId] = listaA.map((id) =>
            id === t.deDiaconoId ? t.paraDiaconoId : id
          );
        }
      }
      if (slotsCompletos) {
        for (const funcoes of Object.values(atr)) {
          for (const fid of Object.keys(funcoes)) {
            funcoes[fid] = (funcoes[fid] || []).filter((id) => id !== t.deDiaconoId);
          }
        }
      }
      // A sai e não assume a função antiga de B
    } else {
      const slotsA =
        Array.isArray(t.slotsOrigem) && t.slotsOrigem.length
          ? t.slotsOrigem
          : [{ equipeId: t.equipeId, funcaoId: t.funcaoId }];
      const slotsB = Array.isArray(t.slotsAlvo)
        ? t.slotsAlvo
        : t.funcaoAlvo
          ? [{ equipeId: t.equipeAlvo, funcaoId: t.funcaoAlvo }]
          : [];

      for (const slot of slotsA) {
        if (!Engine().candidatoValido(state, b, t.data, slot.funcaoId, new Set(), { permitirReuso: true })) {
          return { ok: false, erro: `${b.nome} não pode assumir ${nomeUmaFuncao(state, slot.funcaoId)}.` };
        }
      }
      for (const slot of slotsB) {
        if (!Engine().candidatoValido(state, a, t.data, slot.funcaoId, new Set(), { permitirReuso: true })) {
          return { ok: false, erro: `${a.nome} não pode assumir ${nomeUmaFuncao(state, slot.funcaoId)}.` };
        }
      }

      if (!slotsB.length) {
        for (const funcoes of Object.values(atr)) {
          for (const fid of Object.keys(funcoes)) {
            funcoes[fid] = (funcoes[fid] || []).filter((id) => id !== t.paraDiaconoId);
          }
        }
        for (const slot of slotsA) {
          if (!atr[slot.equipeId]) atr[slot.equipeId] = {};
          const listaA = atr[slot.equipeId][slot.funcaoId] || [];
          atr[slot.equipeId][slot.funcaoId] = listaA.map((id) =>
            id === t.deDiaconoId ? t.paraDiaconoId : id
          );
        }
      } else {
        for (const slot of slotsA) {
          if (!atr[slot.equipeId]) atr[slot.equipeId] = {};
          const listaA = atr[slot.equipeId][slot.funcaoId] || [];
          atr[slot.equipeId][slot.funcaoId] = listaA.map((id) =>
            id === t.deDiaconoId ? t.paraDiaconoId : id
          );
        }
        for (const slot of slotsB) {
          if (!atr[slot.equipeId]) atr[slot.equipeId] = {};
          const listaB = atr[slot.equipeId][slot.funcaoId] || [];
          atr[slot.equipeId][slot.funcaoId] = listaB.map((id) =>
            id === t.paraDiaconoId ? t.deDiaconoId : id
          );
        }
      }
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
      if (t.escalaAplicada && t.escalaSnapshot) {
        reverterSnapshotEscala(state, t.data, t.escalaSnapshot);
      }
      t.status = "recusada";
      t.recusadaEm = new Date().toISOString();
      t.escalaAplicada = false;
      delete t.escalaSnapshot;
      t.erroMigracao = res.erro || "Não foi possível aplicar na escala.";
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
          corpo: troca.multifuncao
            ? `A liderança registrou uma troca em ${troca.data} permutando todas as funções deste culto: ${aplicado.a.nome} ↔ ${aplicado.b.nome}.`
            : `A liderança registrou uma ${rotulo.toLowerCase()} em ${troca.data}: ${aplicado.a.nome} → ${aplicado.b.nome}.`,
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
    if (t.status !== "aguardando_aceite" && t.status !== "aguardando_lider") {
      return { ok: false, erro: "Este pedido já foi encerrado." };
    }
    if (t.escalaAplicada && t.escalaSnapshot) {
      reverterSnapshotEscala(state, t.data, t.escalaSnapshot);
      t.escalaAplicada = false;
      delete t.escalaSnapshot;
    }
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

  return {
    solicitar,
    aceitar,
    recusar,
    atualizar,
    excluir,
    aprovar,
    rejeitar,
    executarPeloLider,
    concluirPendentesSemLider,
    slotsDoDiaconoNaEscala,
    nomesFuncoesTroca,
    resumoTrocaMultifuncao,
  };
})();
