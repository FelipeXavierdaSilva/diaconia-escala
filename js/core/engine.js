/**
 * Motor de geração e validação de escala.
 * Prioridades: restrições → funções → horários → preenchimento → equilíbrio → shuffle.
 */
window.DiaconiaEngine = (() => {
  const Cal = () => window.DiaconiaCalendar;

  function uid(prefix = "id") {
    return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
  }

  function shuffle(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function getFuncao(state, id) {
    return state.funcoes.find((f) => f.id === id);
  }

  function getMinisterio(state, id) {
    if (!id) return null;
    return (state.ministerios || []).find((m) => m.id === id) || null;
  }

  /** Ministério ativo do diácono (com horário). */
  function ministerioDoDiacono(state, diacono) {
    if (!diacono?.ministerioId) return null;
    const m = getMinisterio(state, diacono.ministerioId);
    return m && m.ativo !== false ? m : null;
  }

  /** True se o horário da função da diaconia conflita com o ministério do diácono. */
  function conflitoHorarioMinisterio(state, diacono, funcao) {
    if (state.configuracoes?.geracao?.respeitarHorarioMinisterio === false) return false;
    const m = ministerioDoDiacono(state, diacono);
    if (!m || !funcao) return false;
    return Cal().horarioConflitaComJanela(funcao.horario, m.horarioInicio, m.horarioFim);
  }

  function diaconosDaEquipe(state, equipeId) {
    return state.diaconos.filter((d) => d.equipeId === equipeId && d.ativo !== false);
  }

  /** Restrições aprovadas (ou todas se config desligar aprovação) */
  function restricoesAtivas(state) {
    const exigir = state.configuracoes?.exigirAprovacaoRestricao !== false;
    return (state.restricoes || []).filter((r) =>
      exigir ? r.status === "aprovada" : r.status !== "rejeitada"
    );
  }

  function restricoesPara(state, diaconoId, data) {
    return restricoesAtivas(state).filter(
      (r) => r.diaconoId === diaconoId && r.data === data
    );
  }

  function podeParticipar(state, diaconoId, data) {
    return !restricoesPara(state, diaconoId, data).some(
      (r) => r.tipo === "indisponivel"
    );
  }

  function funcoesBloqueadas(state, diaconoId, data) {
    return new Set(
      restricoesPara(state, diaconoId, data)
        .filter((r) => r.tipo === "funcao" && r.funcaoId)
        .map((r) => r.funcaoId)
    );
  }

  function chegadaMaxima(state, diaconoId, data) {
    const lista = restricoesPara(state, diaconoId, data).filter(
      (r) => r.tipo === "horario" && r.horarioChegada
    );
    if (!lista.length) return null;
    return lista.reduce((max, r) => {
      if (!max) return r.horarioChegada;
      return Cal().compararHorario(r.horarioChegada, max) > 0 ? r.horarioChegada : max;
    }, null);
  }

  function temFuncaoPermitida(diacono, funcaoId) {
    if (!diacono.funcoesPermitidas || diacono.funcoesPermitidas.includes("*")) return true;
    return diacono.funcoesPermitidas.includes(funcaoId);
  }

  /** Funções que, por padrão, só podem ser preenchidas por um casal cadastrado. */
  const FUNCOES_EXIGEM_CASAL_PADRAO = ["aconselhamento", "fechar_templo"];

  function funcoesExigemCasalIds(state) {
    const g = state?.configuracoes?.geracao;
    if (Array.isArray(g?.funcoesExigemCasal) && g.funcoesExigemCasal.length) {
      return g.funcoesExigemCasal;
    }
    return FUNCOES_EXIGEM_CASAL_PADRAO;
  }

  function exigeCasal(stateOrId, maybeId) {
    // Compat: exigeCasal(funcaoId) legado → usa padrão; exigeCasal(state, funcaoId) preferido
    if (typeof stateOrId === "string" && maybeId === undefined) {
      return FUNCOES_EXIGEM_CASAL_PADRAO.includes(stateOrId);
    }
    const state = stateOrId;
    const funcaoId = maybeId;
    return funcoesExigemCasalIds(state).includes(funcaoId);
  }

  function parCasalValido(state, idA, idB) {
    if (!idA || !idB || idA === idB) return false;
    return casaisAtivos(state).some(
      (c) =>
        !c.naoServirJuntos &&
        ((c.diaconoIdA === idA && c.diaconoIdB === idB) ||
          (c.diaconoIdA === idB && c.diaconoIdB === idA))
    );
  }

  /** Casal marcado para não servir juntos na diaconia no mesmo culto. */
  function casalNaoServeJuntos(state, diaconoId) {
    const info = infoCasal(state, diaconoId);
    return !!(info?.casal?.naoServirJuntos && info.parceiroId);
  }

  /**
   * @param {object} [opts]
   * @param {boolean} [opts.permitirReuso] — se true, ignora usadosNoDia (acúmulo de funções)
   * @param {Set} [opts.jaNaFuncao]
   */
  function candidatoValido(state, diacono, data, funcaoId, usadosNoDia, opts = {}) {
    if (!diacono || diacono.ativo === false) return false;
    if (!podeParticipar(state, diacono.id, data)) return false;
    if (!opts.permitirReuso && usadosNoDia && usadosNoDia.has(diacono.id)) return false;
    if (!temFuncaoPermitida(diacono, funcaoId)) return false;
    if (funcoesBloqueadas(state, diacono.id, data).has(funcaoId)) return false;
    // Casal "não servir juntos": se o cônjuge já está no culto, este não entra
    if (usadosNoDia && usadosNoDia.size) {
      const info = infoCasal(state, diacono.id);
      if (info?.casal?.naoServirJuntos && usadosNoDia.has(info.parceiroId)) return false;
    }
    const chegada = chegadaMaxima(state, diacono.id, data);
    const funcao = getFuncao(state, funcaoId);
    if (chegada && funcao && !Cal().horarioCompativel(chegada, funcao.horario)) {
      return false;
    }
    if (conflitoHorarioMinisterio(state, diacono, funcao)) return false;
    // Já atribuído a esta função nesta equipe (evita duplicar no mesmo slot)
    if (opts.jaNaFuncao instanceof Set && opts.jaNaFuncao.has(diacono.id)) return false;
    return true;
  }

  function funcoesPadraoAtivas(state) {
    const padrao = state.funcoesPadraoCulto || [];
    return padrao.filter((id) => {
      const f = getFuncao(state, id);
      return f && f.ativo !== false;
    });
  }

  /** Funções do padrão que cabem nesta data (ativo + recorrência). */
  function funcoesParaData(state, dataISO) {
    return funcoesPadraoAtivas(state).filter((id) => {
      const f = getFuncao(state, id);
      return Cal().funcaoEncaixaNaData(f, dataISO);
    });
  }

  function validarParFuncaoCasal(state, funcaoId, ids) {
    if (!exigeCasal(state, funcaoId)) return { ok: true };
    const lista = (ids || []).filter(Boolean);
    if (lista.length < 2) {
      return {
        ok: false,
        erro: "Esta função exige um casal (mínimo 2 pessoas cadastradas como casal).",
      };
    }
    if (!parCasalValido(state, lista[0], lista[1])) {
      return {
        ok: false,
        erro: "Nesta função só pode ficar um casal cadastrado — não dois solteiros nem casado com outra pessoa.",
      };
    }
    return { ok: true };
  }

  /** Contagem histórica de atribuições (equilíbrio geral) */
  function contagemHistorico(state, ateData) {
    const map = {};
    for (const esc of Object.values(state.escalas)) {
      if (ateData && esc.data > ateData) continue;
      const atr = esc.atribuicoes || {};
      for (const eq of Object.values(atr)) {
        for (const ids of Object.values(eq)) {
          for (const id of ids || []) {
            map[id] = (map[id] || 0) + 1;
          }
        }
      }
    }
    return map;
  }

  /** Contagem por função até a data (exclui a própria data) */
  function contagemPorFuncao(state, ateDataExclusiva) {
    const map = {};
    for (const esc of Object.values(state.escalas || {})) {
      if (ateDataExclusiva && esc.data >= ateDataExclusiva) continue;
      for (const eq of Object.values(esc.atribuicoes || {})) {
        for (const [fid, ids] of Object.entries(eq || {})) {
          for (const id of ids || []) {
            if (!map[id]) map[id] = {};
            map[id][fid] = (map[id][fid] || 0) + 1;
          }
        }
      }
    }
    return map;
  }

  /** Contagem de escalas no mês (até data exclusiva) */
  function contagemNoMes(state, ano, mes, ateDataExclusiva) {
    const map = {};
    const prefix = `${ano}-${String(mes).padStart(2, "0")}`;
    for (const esc of Object.values(state.escalas || {})) {
      if (!esc.data?.startsWith(prefix)) continue;
      if (ateDataExclusiva && esc.data >= ateDataExclusiva) continue;
      for (const eq of Object.values(esc.atribuicoes || {})) {
        for (const ids of Object.values(eq || {})) {
          for (const id of ids || []) {
            map[id] = (map[id] || 0) + 1;
          }
        }
      }
    }
    return map;
  }

  /** Última função de cada diácono antes da data */
  function ultimaFuncaoAntes(state, ateData) {
    const map = {};
    const datas = Object.keys(state.escalas || {})
      .filter((d) => d < ateData)
      .sort();
    for (const data of datas) {
      const esc = state.escalas[data];
      for (const eq of Object.values(esc.atribuicoes || {})) {
        for (const [fid, ids] of Object.entries(eq || {})) {
          for (const id of ids || []) {
            map[id] = fid;
          }
        }
      }
    }
    return map;
  }

  function cfgGeracao(state) {
    const g = state.configuracoes?.geracao || {};
    return {
      variarFuncoesNoMes: g.variarFuncoesNoMes !== false,
      evitarMesmaFuncaoConsecutiva: g.evitarMesmaFuncaoConsecutiva !== false,
      embaralharOrdemFuncoes: g.embaralharOrdemFuncoes !== false,
      equilibrarParticipacao: g.equilibrarParticipacao !== false,
      maxEscalasPorDiaconoNoMes: Math.max(0, +g.maxEscalasPorDiaconoNoMes || 0),
      maxPessoasPorCulto: Math.max(0, +g.maxPessoasPorCulto || 0),
      maxPessoasPorEvento: Math.max(0, +g.maxPessoasPorEvento || 0),
      permitirAcumularFuncoes: g.permitirAcumularFuncoes !== false,
      respeitarHorarioMinisterio: g.respeitarHorarioMinisterio !== false,
      priorizarSemMinisterio: g.priorizarSemMinisterio !== false,
      funcoesExigemCasal: Array.isArray(g.funcoesExigemCasal)
        ? [...g.funcoesExigemCasal]
        : [...FUNCOES_EXIGEM_CASAL_PADRAO],
    };
  }

  function maxPessoasDoEvento(state, escala) {
    const cfg = cfgGeracao(state);
    const tipo = escala?.tipo === "evento" ? "evento" : "culto";
    return tipo === "evento" ? cfg.maxPessoasPorEvento : cfg.maxPessoasPorCulto;
  }

  function statusEquipe(escala, equipeId, state) {
    const atr = escala.atribuicoes?.[equipeId] || {};
    const funcoes = escala.funcoesIds || state.funcoesPadraoCulto;
    let completa = true;
    let vazia = true;
    for (const fid of funcoes) {
      const f = getFuncao(state, fid);
      const qtd = f?.qtdPorEquipe || 1;
      const ids = atr[fid] || [];
      if (ids.length) vazia = false;
      if (ids.length < qtd) completa = false;
    }
    if (vazia) return "vazia";
    if (completa) return "completa";
    return "parcial";
  }

  function statusEscala(escala, state) {
    if (!escala) return "inexistente";
    if (escala.alertaAfetacao) return "afetada";
    const problemas = escala.problemas || [];
    if (problemas.length) return "incompleta";
    const equipes = escala.equipesIds || [];
    if (!equipes.length) return "rascunho";
    const statuses = equipes.map((eq) => statusEquipe(escala, eq, state));
    if (statuses.every((s) => s === "completa")) return "completa";
    if (statuses.every((s) => s === "vazia")) return "rascunho";
    return "em_edicao";
  }

  function labelStatus(st) {
    const map = {
      completa: { texto: "Completa", tom: "ok" },
      em_edicao: { texto: "Em edição", tom: "warn" },
      rascunho: { texto: "Rascunho", tom: "muted" },
      incompleta: { texto: "Incompleta", tom: "danger" },
      afetada: { texto: "Afetada", tom: "danger" },
      inexistente: { texto: "—", tom: "muted" },
    };
    return map[st] || map.rascunho;
  }

  /**
   * Gera atribuições para uma equipe em uma data.
   * 1) Funções que exigem casal (aconselhamento, fechar_templo)
   * 2) Demais funções sem reutilizar pessoa
   * 3) 2ª passagem: acumula funções se ainda faltarem vagas
   */
  function gerarEquipe(state, escala, equipeId, historicoBase) {
    const data = escala.data;
    const cfg = cfgGeracao(state);
    const [anoStr, mesStr] = data.split("-");
    const ano = +anoStr;
    const mes = +mesStr;
    let funcoesIds = [...(escala.funcoesIds || state.funcoesPadraoCulto || [])];
    if (cfg.embaralharOrdemFuncoes) funcoesIds = shuffle(funcoesIds);

    const membros = diaconosDaEquipe(state, equipeId);
    const usados = new Set();
    const atribuicoes = {};
    const problemas = [];
    const hist = { ...(historicoBase || contagemHistorico(state, data)) };
    const histFuncao = contagemPorFuncao(state, data);
    const histMes = contagemNoMes(state, ano, mes, data);
    const ultimaFn = ultimaFuncaoAntes(state, data);
    const usarCasais = state.configuracoes?.respeitarCasais !== false;
    const maxPessoas = maxPessoasDoEvento(state, escala);

    for (const fid of funcoesIds) atribuicoes[fid] = [];

    function atingiuLimitePessoas() {
      return maxPessoas > 0 && usados.size >= maxPessoas;
    }

    function slotsLivres(fid) {
      const f = getFuncao(state, fid);
      const qtd = f?.qtdPorEquipe || 1;
      return qtd - (atribuicoes[fid]?.length || 0);
    }

    function atribuir(fid, diaconoId) {
      if (!atribuicoes[fid]) atribuicoes[fid] = [];
      if (atribuicoes[fid].includes(diaconoId)) return;
      atribuicoes[fid].push(diaconoId);
      usados.add(diaconoId);
      hist[diaconoId] = (hist[diaconoId] || 0) + 1;
      histMes[diaconoId] = (histMes[diaconoId] || 0) + 1;
      if (!histFuncao[diaconoId]) histFuncao[diaconoId] = {};
      histFuncao[diaconoId][fid] = (histFuncao[diaconoId][fid] || 0) + 1;
      ultimaFn[diaconoId] = fid;
    }

    function scoreCandidato(d, fid) {
      let score = 0;
      if (cfg.equilibrarParticipacao) score += hist[d.id] || 0;
      if (cfg.variarFuncoesNoMes) score += (histFuncao[d.id]?.[fid] || 0) * 4;
      if (cfg.evitarMesmaFuncaoConsecutiva && ultimaFn[d.id] === fid) score += 12;
      score += (histMes[d.id] || 0) * 0.5;
      if (usados.has(d.id)) score += 20; // preferir quem ainda não foi escalado hoje
      // Quem tem outro ministério: leve prioridade menor (não sobrecarregar quem só está na diaconia)
      if (cfg.priorizarSemMinisterio && ministerioDoDiacono(state, d)) score += 2.5;
      return score;
    }

    function dentroDoLimiteMensal(d) {
      if (!cfg.maxEscalasPorDiaconoNoMes) return true;
      return (histMes[d.id] || 0) < cfg.maxEscalasPorDiaconoNoMes;
    }

    function elegivel(d, fid, opts = {}) {
      return (
        dentroDoLimiteMensal(d) &&
        candidatoValido(state, d, data, fid, usados, {
          permitirReuso: !!opts.permitirReuso,
          jaNaFuncao: new Set(atribuicoes[fid] || []),
        })
      );
    }

    function colocarParceiroSePossivel(diaconoId, funcaoAtualId) {
      if (!usarCasais || atingiuLimitePessoas()) return;
      if (exigeCasal(state, funcaoAtualId)) return; // já tratado em bloco de casal
      const info = infoCasal(state, diaconoId);
      if (!info?.casal?.preferirMesmoDia) return;
      if (info.casal.naoServirJuntos) return;
      const parceiro = membros.find((d) => d.id === info.parceiroId);
      if (!parceiro || usados.has(parceiro.id)) return;
      if (!podeParticipar(state, parceiro.id, data)) return;
      if (!dentroDoLimiteMensal(parceiro)) return;

      if (info.casal.preferirMesmaFuncao && slotsLivres(funcaoAtualId) > 0) {
        if (elegivel(parceiro, funcaoAtualId)) {
          atribuir(funcaoAtualId, parceiro.id);
          return;
        }
      }

      const outras = shuffle(
        funcoesIds.filter(
          (fid) => fid !== funcaoAtualId && !exigeCasal(state, fid) && slotsLivres(fid) > 0
        )
      );
      for (const fid of outras) {
        if (atingiuLimitePessoas()) return;
        if (elegivel(parceiro, fid)) {
          atribuir(fid, parceiro.id);
          return;
        }
      }
    }

    /** Preenche funções que exigem casal com pares cadastrados. */
    function preencherFuncoesCasal(permitirReuso) {
      const fids = funcoesIds.filter((fid) => exigeCasal(state, fid) && getFuncao(state, fid));
      for (const fid of fids) {
        while (slotsLivres(fid) >= 2) {
          if (maxPessoas > 0 && usados.size >= maxPessoas && !permitirReuso) break;

          const casaisEq = shuffle(casaisDaEquipe(state, equipeId));
          let colocado = false;
          // Preferir casal que já está no dia / já em outra função de casal
          const ordenados = [...casaisEq].sort((c1, c2) => {
            const s = (c) =>
              (usados.has(c.diaconoIdA) ? 1 : 0) + (usados.has(c.diaconoIdB) ? 1 : 0);
            return s(c2) - s(c1);
          });

          for (const casal of ordenados) {
            if (casal.naoServirJuntos) continue;
            const a = membros.find((d) => d.id === casal.diaconoIdA);
            const b = membros.find((d) => d.id === casal.diaconoIdB);
            if (!a || !b) continue;
            if (!elegivel(a, fid, { permitirReuso }) || !elegivel(b, fid, { permitirReuso })) {
              continue;
            }
            if (
              maxPessoas > 0 &&
              !permitirReuso &&
              !usados.has(a.id) &&
              !usados.has(b.id) &&
              usados.size + 2 > maxPessoas
            ) {
              continue;
            }
            atribuir(fid, a.id);
            atribuir(fid, b.id);
            colocado = true;
            break;
          }
          if (!colocado) break;
        }
      }
    }

    // 0) Aconselhamento + Fechar templo (casais) — 1ª tentativa sem reuso
    preencherFuncoesCasal(false);

    // 1) Casais com preferirMesmaFuncao (funções que NÃO exigem casal)
    if (usarCasais && !atingiuLimitePessoas()) {
      const casaisEq = casaisDaEquipe(state, equipeId).filter(
        (c) => c.preferirMesmoDia && c.preferirMesmaFuncao && !c.naoServirJuntos
      );
      for (const casal of shuffle(casaisEq)) {
        if (atingiuLimitePessoas()) break;
        const a = membros.find((d) => d.id === casal.diaconoIdA);
        const b = membros.find((d) => d.id === casal.diaconoIdB);
        if (!a || !b || usados.has(a.id) || usados.has(b.id)) continue;
        if (!podeParticipar(state, a.id, data) || !podeParticipar(state, b.id, data)) continue;
        if (!dentroDoLimiteMensal(a) || !dentroDoLimiteMensal(b)) continue;
        if (maxPessoas > 0 && usados.size + 2 > maxPessoas) continue;

        const fidOk = shuffle(funcoesIds).find((fid) => {
          if (exigeCasal(state, fid)) return false;
          const f = getFuncao(state, fid);
          return (
            (f?.qtdPorEquipe || 1) >= 2 &&
            slotsLivres(fid) >= 2 &&
            elegivel(a, fid) &&
            elegivel(b, fid)
          );
        });
        if (fidOk) {
          atribuir(fidOk, a.id);
          atribuir(fidOk, b.id);
        }
      }
    }

    // 2) Preencher demais funções sem reuso
    const funcoesNormais = funcoesIds.filter((fid) => !exigeCasal(state, fid));
    for (const fid of funcoesNormais) {
      const funcao = getFuncao(state, fid);
      if (!funcao) continue;
      const qtd = funcao.qtdPorEquipe || 1;

      while ((atribuicoes[fid]?.length || 0) < qtd) {
        if (atingiuLimitePessoas()) break;
        const candidatos = shuffle(membros.filter((d) => elegivel(d, fid))).sort((x, y) => {
          const px = prioridadeCasal(state, x.id, usados);
          const py = prioridadeCasal(state, y.id, usados);
          if (px !== py) return px - py;
          return scoreCandidato(x, fid) - scoreCandidato(y, fid);
        });

        if (!candidatos.length) break;
        const escolhido = candidatos[0];
        atribuir(fid, escolhido.id);
        colocarParceiroSePossivel(escolhido.id, fid);
      }
    }

    // 3) Última chance: cônjuge ainda de fora (funções normais)
    if (usarCasais && !atingiuLimitePessoas()) {
      for (const casal of casaisDaEquipe(state, equipeId)) {
        if (!casal.preferirMesmoDia || casal.naoServirJuntos || atingiuLimitePessoas()) continue;
        const ids = [casal.diaconoIdA, casal.diaconoIdB];
        const noDia = ids.filter((id) => usados.has(id));
        const fora = ids.find((id) => !usados.has(id));
        if (noDia.length !== 1 || !fora) continue;
        const parceiro = membros.find((d) => d.id === fora);
        if (!parceiro || !podeParticipar(state, fora, data)) continue;
        if (!dentroDoLimiteMensal(parceiro)) continue;
        const fid = shuffle(funcoesNormais).find((f) => slotsLivres(f) > 0 && elegivel(parceiro, f));
        if (fid) atribuir(fid, fora);
      }
    }

    // 4) 2ª passagem: acumular funções (reuso) — casais primeiro, depois normais
    if (cfg.permitirAcumularFuncoes) {
      preencherFuncoesCasal(true);

      for (const fid of funcoesNormais) {
        const funcao = getFuncao(state, fid);
        if (!funcao) continue;
        const qtd = funcao.qtdPorEquipe || 1;
        while ((atribuicoes[fid]?.length || 0) < qtd) {
          const candidatos = shuffle(
            membros.filter((d) => elegivel(d, fid, { permitirReuso: true }))
          ).sort((x, y) => scoreCandidato(x, fid) - scoreCandidato(y, fid));
          if (!candidatos.length) break;
          atribuir(fid, candidatos[0].id);
        }
      }
    }

    for (const fid of funcoesIds) {
      const funcao = getFuncao(state, fid);
      if (!funcao) continue;
      const qtd = Math.max(funcao.qtdPorEquipe || 1, exigeCasal(state, fid) ? 2 : 1);
      const ids = atribuicoes[fid] || [];
      if (ids.length < qtd) {
        const porLimite = atingiuLimitePessoas() && ids.length === 0;
        const faltaCasal = exigeCasal(state, fid);
        problemas.push({
          equipeId,
          funcaoId: fid,
          necessario: qtd,
          obtido: ids.length,
          mensagem: porLimite
            ? `A função ${funcao.nome} ficou incompleta pelo limite de pessoas configurado para este tipo de evento.`
            : faltaCasal
              ? `A função ${funcao.nome} precisa de um casal cadastrado (2 pessoas). Só há ${ids.length}.`
              : `A função ${funcao.nome} precisa de ${qtd} pessoa(s), mas só há ${ids.length} disponível(eis) autorizado(s).`,
          sugestoes: porLimite
            ? [
                "Aumente o máximo de pessoas em Configurações → Regras de geração.",
                "Ou reduza a quantidade exigida na função.",
              ]
            : faltaCasal
              ? [
                  "Cadastre o casal em Casais (mesma equipe).",
                  "Ou desative esta função neste culto em Editar data e equipe.",
                  "Revise restrições aprovadas desta data.",
                ]
              : [
                  "Autorizar outro diácono para a função.",
                  "Adicionar um diácono à equipe.",
                  "Revisar restrições aprovadas desta data.",
                ],
        });
      } else if (exigeCasal(state, fid)) {
        const v = validarParFuncaoCasal(state, fid, ids);
        if (!v.ok) {
          problemas.push({
            equipeId,
            funcaoId: fid,
            necessario: qtd,
            obtido: ids.length,
            mensagem: `${funcao.nome}: ${v.erro}`,
            sugestoes: [
              "Substitua por um casal cadastrado.",
              "Ou monte manualmente com o casal correto.",
            ],
          });
        }
      }
    }

    return { atribuicoes, problemas, historico: hist };
  }

  /** 0 = parceiro já no dia (priorizar); 1 = normal; 2 = casal sem preferência de dia */
  function prioridadeCasal(state, diaconoId, usados) {
    const info = infoCasal(state, diaconoId);
    if (!info?.casal?.preferirMesmoDia) return 1;
    if (usados.has(info.parceiroId)) return 0;
    return 1;
  }

  function casaisAtivos(state) {
    return (state.casais || []).filter((c) => c.ativo !== false);
  }

  function infoCasal(state, diaconoId) {
    const casal = casaisAtivos(state).find(
      (c) => c.diaconoIdA === diaconoId || c.diaconoIdB === diaconoId
    );
    if (!casal) return null;
    return {
      casal,
      parceiroId: casal.diaconoIdA === diaconoId ? casal.diaconoIdB : casal.diaconoIdA,
    };
  }

  function casaisDaEquipe(state, equipeId) {
    const ids = new Set(diaconosDaEquipe(state, equipeId).map((d) => d.id));
    return casaisAtivos(state).filter(
      (c) => ids.has(c.diaconoIdA) && ids.has(c.diaconoIdB)
    );
  }

  function nomeCasal(state, casal) {
    const a = state.diaconos.find((d) => d.id === casal.diaconoIdA)?.nome || "?";
    const b = state.diaconos.find((d) => d.id === casal.diaconoIdB)?.nome || "?";
    return `${a} & ${b}`;
  }

  function gerarEscalaData(state, data, { equipesIds } = {}) {
    const escala = state.escalas[data];
    if (!escala) return { ok: false, erro: "Escala não encontrada para a data." };
    const eqs = equipesIds || escala.equipesIds || [];
    let hist = contagemHistorico(state, data);
    const atr = { ...(escala.atribuicoes || {}) };
    let problemas = (escala.problemas || []).filter((p) => !eqs.includes(p.equipeId));

    for (const eq of eqs) {
      const result = gerarEquipe(state, escala, eq, hist);
      atr[eq] = result.atribuicoes;
      hist = result.historico;
      problemas = problemas.concat(result.problemas);
    }

    escala.atribuicoes = atr;
    escala.problemas = problemas;
    delete escala.alertaAfetacao;
    escala.status = statusEscala(escala, state);
    escala.gerada = true;
    return { ok: true, escala };
  }

  function gerarMes(state, ano, mes) {
    const lista = Cal().escalasDoMes(state, ano, mes);
    let hist = contagemHistorico(state, `${ano}-${String(mes).padStart(2, "0")}-01`);
    for (const esc of lista) {
      const eqs = esc.equipesIds || [];
      const atr = {};
      let problemas = [];
      for (const eq of eqs) {
        const result = gerarEquipe(state, esc, eq, hist);
        atr[eq] = result.atribuicoes;
        hist = result.historico;
        problemas = problemas.concat(result.problemas);
      }
      esc.atribuicoes = atr;
      esc.problemas = problemas;
      esc.status = statusEscala(esc, state);
      esc.gerada = true;
    }
    return lista;
  }

  function escalasGeradasDoMes(state, ano, mes) {
    return Cal().escalasDoMes(state, ano, mes).filter((e) => e.gerada === true);
  }

  function garantirEscalasMes(state, ano, mes) {
    const Seed = window.DiaconiaSeed;
    const eqs = (state.equipes || []).filter((e) => e.ativa !== false).map((e) => e.id);
    if (!eqs.length) return 0;
    const horario = state.configuracoes?.horarioPadrao || "18:00";
    const datas = Cal().domingosDoMes(ano, mes);
    if (!datas.length) return 0;
    const anteriores = Object.keys(state.escalas || {})
      .filter((d) => d < datas[0])
      .sort();
    let start = 0;
    if (anteriores.length) {
      const ultimaEq = state.escalas[anteriores[anteriores.length - 1]]?.equipesIds?.[0];
      const idx = eqs.indexOf(ultimaEq);
      start = idx >= 0 ? idx + 1 : 0;
    }
    let criadas = 0;
    datas.forEach((data, i) => {
      if (state.escalas[data]) return;
      const eq = eqs[(start + i) % eqs.length];
      const fids = funcoesParaData(state, data);
      state.escalas[data] = Seed.criarEscalaBase(
        data,
        "culto",
        "Culto",
        horario,
        [eq],
        fids.length ? fids : funcoesPadraoAtivas(state)
      );
      criadas += 1;
    });
    return criadas;
  }

  function gerarPeriodo(state, anoInicio, mesInicio, qtdMeses) {
    let ano = anoInicio;
    let mes = mesInicio;
    let criadas = 0;
    let mesesGerados = 0;
    const qtd = Math.min(12, Math.max(1, Number(qtdMeses) || 1));
    for (let i = 0; i < qtd; i++) {
      criadas += garantirEscalasMes(state, ano, mes);
      gerarMes(state, ano, mes);
      mesesGerados += 1;
      mes += 1;
      if (mes > 12) {
        mes = 1;
        ano += 1;
      }
    }
    return { mesesGerados, criadas };
  }

  function garantirEscalasAno(state, ano) {
    const Seed = window.DiaconiaSeed;
    const eqs = (state.equipes || []).filter((e) => e.ativa !== false).map((e) => e.id);
    const horario = state.configuracoes?.horarioPadrao || "18:00";
    const datas = [];
    for (let mes = 1; mes <= 12; mes++) {
      datas.push(...Cal().domingosDoMes(ano, mes));
    }
    const anteriores = Object.keys(state.escalas || {})
      .filter((d) => d < `${ano}-01-01`)
      .sort();
    let start = 0;
    if (anteriores.length && eqs.length) {
      const ultimaEq = state.escalas[anteriores[anteriores.length - 1]]?.equipesIds?.[0];
      const idx = eqs.indexOf(ultimaEq);
      start = idx >= 0 ? idx + 1 : 0;
    }
    let criadas = 0;
    datas.forEach((data, i) => {
      if (state.escalas[data]) return;
      const eq = eqs.length ? eqs[(start + i) % eqs.length] : "eq01";
      const fids = funcoesParaData(state, data);
      state.escalas[data] = Seed.criarEscalaBase(
        data,
        "culto",
        "Culto",
        horario,
        [eq],
        fids.length ? fids : funcoesPadraoAtivas(state)
      );
      criadas += 1;
    });
    return { datas: datas.length, criadas };
  }

  function gerarAno(state, ano) {
    const prep = garantirEscalasAno(state, ano);
    const meses = [];
    for (let mes = 1; mes <= 12; mes++) {
      meses.push(gerarMes(state, ano, mes));
    }
    return { ...prep, meses: meses.length };
  }

  function candidatosParaFuncao(state, data, equipeId, funcaoId, excluirIds = []) {
    const excluidos = new Set(excluirIds);
    return diaconosDaEquipe(state, equipeId).filter(
      (d) =>
        !excluidos.has(d.id) &&
        candidatoValido(state, d, data, funcaoId, new Set())
    );
  }

  function alterarAtribuicao(state, data, equipeId, funcaoId, novosIds) {
    const escala = state.escalas[data];
    if (!escala) return { ok: false, erro: "Escala não encontrada." };
    const atr = escala.atribuicoes || (escala.atribuicoes = {});
    if (!atr[equipeId]) atr[equipeId] = {};

    for (const id of novosIds) {
      const d = state.diaconos.find((x) => x.id === id);
      if (!d) return { ok: false, erro: "Diácono não encontrado." };
      if (!candidatoValido(state, d, data, funcaoId, new Set())) {
        return {
          ok: false,
          erro: `${d.nome} não pode assumir esta função nesta data (restrição, horário ou permissão).`,
        };
      }
    }

    atr[equipeId][funcaoId] = [...novosIds];
    // recalcular problemas da equipe
    const regen = gerarEquipe(
      { ...state, escalas: { ...state.escalas, [data]: { ...escala, atribuicoes: { ...atr, [equipeId]: {} } } } },
      escala,
      equipeId,
      contagemHistorico(state, data)
    );
    // manter atribuição manual, só validar problemas
    const funcao = getFuncao(state, funcaoId);
    if (!funcao) return { ok: false, erro: "Função não encontrada." };
    const qtd = Math.max(funcao.qtdPorEquipe || 1, exigeCasal(state, funcaoId) ? 2 : 1);
    if (exigeCasal(state, funcaoId) && novosIds.length >= 2) {
      const v = validarParFuncaoCasal(state, funcaoId, novosIds);
      if (!v.ok) return { ok: false, erro: v.erro };
    }
    escala.problemas = (escala.problemas || []).filter(
      (p) => !(p.equipeId === equipeId && p.funcaoId === funcaoId)
    );
    if (novosIds.length < qtd) {
      escala.problemas.push({
        equipeId,
        funcaoId,
        necessario: qtd,
        obtido: novosIds.length,
        mensagem: exigeCasal(state, funcaoId)
          ? `A função ${funcao.nome} precisa de um casal cadastrado (2 pessoas).`
          : `A função ${funcao.nome} precisa de ${qtd} pessoa(s).`,
        sugestoes: regen.problemas[0]?.sugestoes || ["Completar a atribuição."],
      });
    }
    escala.status = statusEscala(escala, state);
    return { ok: true, escala };
  }

  /**
   * Salva a escala completa de uma equipe montada manualmente.
   * atribuicoesEq: { funcaoId: [diaconoId, ...] }
   */
  function salvarEscalaManual(state, data, equipeId, atribuicoesEq) {
    const escala = state.escalas[data];
    if (!escala) return { ok: false, erro: "Escala não encontrada." };

    const funcoesIds = escala.funcoesIds || state.funcoesPadraoCulto;
    const limpas = {};
    const problemas = [];
    const noDia = new Set();

    for (const fid of funcoesIds) {
      const funcao = getFuncao(state, fid);
      if (!funcao) continue;
      const qtd = Math.max(funcao.qtdPorEquipe || 1, exigeCasal(state, fid) ? 2 : 1);
      const raw = (atribuicoesEq[fid] || []).filter(Boolean);
      const ids = [];

      for (const id of raw) {
        if (ids.includes(id)) {
          return { ok: false, erro: `Diácono repetido na função ${funcao.nome}.` };
        }
        const d = state.diaconos.find((x) => x.id === id);
        if (!d) return { ok: false, erro: "Diácono não encontrado." };
        if (
          !candidatoValido(state, d, data, fid, noDia, {
            permitirReuso: true,
            jaNaFuncao: new Set(ids),
          })
        ) {
          const info = infoCasal(state, d.id);
          if (info?.casal?.naoServirJuntos && noDia.has(info.parceiroId)) {
            return {
              ok: false,
              erro: `${d.nome} não pode servir neste culto junto com o cônjuge (casal marcado para não servir juntos na diaconia).`,
            };
          }
          return {
            ok: false,
            erro: `${d.nome} não pode ficar em ${funcao.nome} nesta data (restrição, horário ou permissão).`,
          };
        }
        ids.push(id);
      }

      if (exigeCasal(state, fid) && ids.length >= 2) {
        const v = validarParFuncaoCasal(state, fid, ids);
        if (!v.ok) return { ok: false, erro: `${funcao.nome}: ${v.erro}` };
      }

      limpas[fid] = ids;
      for (const id of ids) noDia.add(id);
      if (ids.length < qtd) {
        problemas.push({
          equipeId,
          funcaoId: fid,
          necessario: qtd,
          obtido: ids.length,
          mensagem: exigeCasal(state, fid)
            ? `A função ${funcao.nome} precisa de um casal cadastrado (2 pessoas).`
            : `A função ${funcao.nome} precisa de ${qtd} pessoa(s), mas só há ${ids.length} selecionada(s).`,
          sugestoes: exigeCasal(state, fid)
            ? ["Selecione os dois membros de um casal cadastrado."]
            : ["Completar a atribuição manualmente.", "Ou usar Gerar/Embaralhar depois."],
        });
      }
    }

    if (!escala.atribuicoes) escala.atribuicoes = {};
    escala.atribuicoes[equipeId] = limpas;
    escala.problemas = [
      ...(escala.problemas || []).filter((p) => p.equipeId !== equipeId),
      ...problemas,
    ];
    delete escala.alertaAfetacao;
    escala.status = statusEscala(escala, state);
    return { ok: true, escala, problemas };
  }

  /** Escalas afetadas por restrição nova */
  function escalasAfetadasPorRestricao(state, restricao) {
    const esc = state.escalas[restricao.data];
    if (!esc || !esc.atribuicoes) return [];
    const afetadas = [];
    for (const [eqId, funcoes] of Object.entries(esc.atribuicoes)) {
      for (const [fid, ids] of Object.entries(funcoes)) {
        if (!(ids || []).includes(restricao.diaconoId)) continue;
        if (restricao.tipo === "indisponivel") {
          afetadas.push({ data: restricao.data, equipeId: eqId, funcaoId: fid });
        } else if (restricao.tipo === "funcao" && restricao.funcaoId === fid) {
          afetadas.push({ data: restricao.data, equipeId: eqId, funcaoId: fid });
        } else if (restricao.tipo === "horario") {
          const funcao = getFuncao(state, fid);
          if (
            restricao.horarioChegada &&
            funcao &&
            !Cal().horarioCompativel(restricao.horarioChegada, funcao.horario)
          ) {
            afetadas.push({ data: restricao.data, equipeId: eqId, funcaoId: fid });
          }
        }
      }
    }
    return afetadas;
  }

  function participacoesDoDiacono(state, diaconoId, ano, mes) {
    const lista = Cal().escalasDoMes(state, ano, mes);
    const rows = [];
    for (const esc of lista) {
      for (const [eqId, funcoes] of Object.entries(esc.atribuicoes || {})) {
        for (const [fid, ids] of Object.entries(funcoes)) {
          if ((ids || []).includes(diaconoId)) {
            rows.push({
              data: esc.data,
              escala: esc,
              equipeId: eqId,
              funcaoId: fid,
              colegas: (ids || []).filter((id) => id !== diaconoId),
            });
          }
        }
      }
    }
    return rows.sort((a, b) => a.data.localeCompare(b.data));
  }

  /** Participações do diácono em uma data específica (independe do mês visível). */
  function participacoesNaData(state, diaconoId, data) {
    const esc = state.escalas[data];
    if (!esc) return [];
    const rows = [];
    for (const [eqId, funcoes] of Object.entries(esc.atribuicoes || {})) {
      for (const [fid, ids] of Object.entries(funcoes)) {
        if ((ids || []).includes(diaconoId)) {
          rows.push({
            data: esc.data,
            escala: esc,
            equipeId: eqId,
            funcaoId: fid,
            colegas: (ids || []).filter((id) => id !== diaconoId),
          });
        }
      }
    }
    return rows;
  }

  function diaconoEstaEscaladoNaData(state, diaconoId, data) {
    return participacoesNaData(state, diaconoId, data).length > 0;
  }

  function proximaEscala(state, diaconoId) {
    const hoje = Cal().hojeISO();
    const todas = Object.values(state.escalas).sort((a, b) => a.data.localeCompare(b.data));
    for (const esc of todas) {
      if (esc.data < hoje) continue;
      for (const [eqId, funcoes] of Object.entries(esc.atribuicoes || {})) {
        for (const [fid, ids] of Object.entries(funcoes)) {
          if ((ids || []).includes(diaconoId)) {
            return { data: esc.data, escala: esc, equipeId: eqId, funcaoId: fid, colegas: (ids || []).filter((i) => i !== diaconoId) };
          }
        }
      }
    }
    return null;
  }

  function resumoMesDiacono(state, diaconoId, ano, mes) {
    const parts = participacoesDoDiacono(state, diaconoId, ano, mes);
    const porFuncao = {};
    for (const p of parts) {
      porFuncao[p.funcaoId] = (porFuncao[p.funcaoId] || 0) + 1;
    }
    return {
      totalEscalas: Cal().escalasDoMes(state, ano, mes).length,
      participacoes: parts.length,
      porFuncao,
      partes: parts,
    };
  }


  /**
   * Atualiza data e/ou equipe responsável de uma escala.
   * Se a equipe mudar, limpa atribuições daquele dia.
   * Se funcoesIds mudar, remove atribuições/problemas das funções desmarcadas.
   */
  function atualizarEscalaDia(state, dataAtual, payload = {}) {
    const esc = state.escalas[dataAtual];
    if (!esc) return { ok: false, erro: "Escala não encontrada." };

    const novaData = payload.data || dataAtual;
    const novaEquipe = payload.equipeId || esc.equipesIds?.[0];

    if (!novaEquipe) return { ok: false, erro: "Selecione a equipe responsável." };
    if (novaData !== dataAtual && state.escalas[novaData]) {
      return { ok: false, erro: `Já existe escala em ${novaData}. Escolha outra data.` };
    }

    const equipeMudou = novaEquipe !== esc.equipesIds?.[0];
    const dataMudou = novaData !== dataAtual;

    if (payload.nome !== undefined) esc.nome = payload.nome;
    if (payload.horario !== undefined) esc.horario = payload.horario;
    if (payload.tipo !== undefined) esc.tipo = payload.tipo;
    if (payload.descricao !== undefined) esc.descricao = payload.descricao;

    let funcoesMudou = false;
    if (Array.isArray(payload.funcoesIds)) {
      const novas = [...new Set(payload.funcoesIds.filter(Boolean))];
      if (!novas.length) return { ok: false, erro: "Selecione ao menos uma função." };
      const antigas = esc.funcoesIds || [];
      funcoesMudou =
        novas.length !== antigas.length || novas.some((id) => !antigas.includes(id));
      esc.funcoesIds = novas;
      const keep = new Set(novas);
      for (const eq of Object.values(esc.atribuicoes || {})) {
        for (const fid of Object.keys(eq || {})) {
          if (!keep.has(fid)) delete eq[fid];
        }
      }
      esc.problemas = (esc.problemas || []).filter((p) => keep.has(p.funcaoId));
      if (funcoesMudou) {
        esc.gerada = false;
        esc.status = statusEscala(esc, state);
      }
    }

    if (equipeMudou) {
      esc.equipesIds = [novaEquipe];
      esc.atribuicoes = {};
      esc.problemas = [];
      esc.status = "rascunho";
      delete esc.alertaAfetacao;
    }

    if (dataMudou) {
      esc.data = novaData;
      esc.id = `esc_${novaData}`;
      delete state.escalas[dataAtual];
      state.escalas[novaData] = esc;

      for (const t of state.trocas || []) {
        if (t.data === dataAtual) t.data = novaData;
      }
      if (typeof window.DiaconiaRestrictions?.recomputarAlertaData === "function") {
        window.DiaconiaRestrictions.recomputarAlertaData(state, dataAtual);
        window.DiaconiaRestrictions.recomputarAlertaData(state, novaData);
      } else {
        delete esc.alertaAfetacao;
        esc.status = statusEscala(esc, state);
      }
    }

    return {
      ok: true,
      data: novaData,
      escala: esc,
      equipeMudou,
      dataMudou,
      funcoesMudou,
    };
  }

  function excluirEscalaDia(state, data) {
    if (!state.escalas[data]) return { ok: false, erro: "Escala não encontrada." };
    state.trocas = (state.trocas || []).filter((t) => t.data !== data);
    delete state.escalas[data];
    return { ok: true };
  }

  return {
    uid,
    shuffle,
    getFuncao,
    getMinisterio,
    ministerioDoDiacono,
    conflitoHorarioMinisterio,
    diaconosDaEquipe,
    restricoesAtivas,
    restricoesPara,
    podeParticipar,
    funcoesBloqueadas,
    chegadaMaxima,
    candidatoValido,
    candidatosParaFuncao,
    exigeCasal,
    funcoesExigemCasalIds,
    parCasalValido,
    validarParFuncaoCasal,
    casalNaoServeJuntos,
    funcoesPadraoAtivas,
    funcoesParaData,
    contagemHistorico,
    cfgGeracao,
    statusEquipe,
    statusEscala,
    labelStatus,
    gerarEquipe,
    gerarEscalaData,
    gerarMes,
    escalasGeradasDoMes,
    garantirEscalasMes,
    garantirEscalasAno,
    gerarPeriodo,
    gerarAno,
    alterarAtribuicao,
    salvarEscalaManual,
    atualizarEscalaDia,
    excluirEscalaDia,
    escalasAfetadasPorRestricao,
    participacoesDoDiacono,
    participacoesNaData,
    diaconoEstaEscaladoNaData,
    proximaEscala,
    resumoMesDiacono,
    casaisAtivos,
    infoCasal,
    casaisDaEquipe,
    nomeCasal,
  };
})();