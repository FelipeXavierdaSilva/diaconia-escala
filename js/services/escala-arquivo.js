/**
 * Arquivo de escalas — cópias de segurança para recuperar cultos apagados
 * ou visualizar/gerar PDF de uma versão guardada.
 */
window.DiaconiaEscalaArquivo = (() => {
  const LIMITE = 80;

  const MOTIVOS = {
    gerar: { texto: "Geração", tom: "ok" },
    criar: { texto: "Criação", tom: "ok" },
    exclusao: { texto: "Exclusão", tom: "warn" },
    antes_gerar: { texto: "Antes de gerar", tom: "muted" },
    antes_restaurar: { texto: "Antes de restaurar", tom: "muted" },
  };

  function Engine() {
    return window.DiaconiaEngine;
  }
  function Cal() {
    return window.DiaconiaCalendar;
  }
  function Hist() {
    return window.DiaconiaHistory;
  }

  function ensure(state) {
    if (!Array.isArray(state.escalasArquivo)) state.escalasArquivo = [];
    return state.escalasArquivo;
  }

  function clonar(esc) {
    try {
      return JSON.parse(JSON.stringify(esc));
    } catch {
      return null;
    }
  }

  function datasPeriodo(anoInicio, mesInicio, qtdMeses) {
    const qtd = Math.min(12, Math.max(1, Number(qtdMeses) || 1));
    let ano = anoInicio;
    let mes = mesInicio;
    const datas = [];
    for (let i = 0; i < qtd; i++) {
      datas.push(...(Cal().domingosDoMes(ano, mes) || []));
      mes += 1;
      if (mes > 12) {
        mes = 1;
        ano += 1;
      }
    }
    return datas;
  }

  function motivoInfo(motivo) {
    return MOTIVOS[motivo] || { texto: motivo || "Arquivo", tom: "muted" };
  }

  function guardar(state, { motivo, mensagem, usuarioId = null, escalas = {} } = {}) {
    ensure(state);
    const map = {};
    for (const [data, esc] of Object.entries(escalas || {})) {
      if (!esc || !data) continue;
      const copia = clonar(esc);
      if (copia) map[data] = copia;
    }
    const datas = Object.keys(map).sort();
    if (!datas.length) return { ok: false, vazio: true };

    const item = {
      id: Engine().uid("earq"),
      em: new Date().toISOString(),
      motivo: motivo || "arquivo",
      mensagem: mensagem || `${datas.length} culto(s) guardado(s).`,
      usuarioId: usuarioId || null,
      datas,
      qtd: datas.length,
      escalas: map,
    };
    state.escalasArquivo.unshift(item);
    if (state.escalasArquivo.length > LIMITE) state.escalasArquivo.length = LIMITE;
    return { ok: true, item };
  }

  function guardarDatas(state, datas, opts = {}) {
    const escalas = {};
    for (const d of datas || []) {
      if (state.escalas?.[d]) escalas[d] = state.escalas[d];
    }
    return guardar(state, { ...opts, escalas });
  }

  function get(state, id) {
    return ensure(state).find((x) => x.id === id) || null;
  }

  function listar(state) {
    return [...ensure(state)];
  }

  function excluirArquivo(state, id) {
    const before = ensure(state).length;
    state.escalasArquivo = state.escalasArquivo.filter((x) => x.id !== id);
    return { ok: state.escalasArquivo.length < before };
  }

  /**
   * Guarda cópia e remove as escalas do dia (e trocas da data).
   */
  function excluirDias(state, datas, sessao) {
    const list = [...new Set(datas || [])].filter((d) => state.escalas?.[d]);
    if (!list.length) return { ok: false, erro: "Nenhuma escala para excluir." };
    guardarDatas(state, list, {
      motivo: "exclusao",
      mensagem:
        list.length === 1
          ? `Cópia de segurança ao excluir ${list[0]}.`
          : `Cópia de segurança ao excluir ${list.length} escala(s).`,
      usuarioId: sessao?.usuarioId,
    });
    let qtd = 0;
    for (const d of list) {
      const res = Engine().excluirEscalaDia(state, d);
      if (res?.ok) qtd += 1;
    }
    Hist()?.add?.(state, {
      tipo: "escala",
      mensagem:
        qtd === 1
          ? `Escala excluída: ${list[0]} (cópia no arquivo).`
          : `${qtd} escala(s) excluída(s) (cópia no arquivo).`,
      usuarioId: sessao?.usuarioId,
    });
    return { ok: qtd > 0, qtd };
  }

  function restaurar(state, id, { sobrescrever = false } = {}) {
    const item = get(state, id);
    if (!item) return { ok: false, erro: "Arquivo não encontrado." };
    const conflito = (item.datas || []).filter((d) => state.escalas?.[d]);
    if (conflito.length && !sobrescrever) {
      return {
        ok: false,
        conflito,
        precisaConfirmar: true,
        erro: `Já existe escala em ${conflito.length} data(s). Restaurar mesmo assim substitui o que está no calendário.`,
      };
    }
    if (conflito.length) {
      guardarDatas(state, conflito, {
        motivo: "antes_restaurar",
        mensagem: `Cópia de segurança antes de restaurar ${item.qtd || item.datas?.length || 0} culto(s) do arquivo.`,
        usuarioId: window.DiaconiaAuth?.sessao?.()?.usuarioId,
      });
    }
    let qtd = 0;
    for (const data of item.datas || []) {
      const esc = item.escalas?.[data];
      if (!esc) continue;
      const copia = clonar(esc);
      if (!copia) continue;
      copia.data = data;
      state.escalas[data] = copia;
      qtd += 1;
    }
    Hist()?.add?.(state, {
      tipo: "escala",
      mensagem: `Escala restaurada do arquivo (${qtd} culto(s)).`,
      usuarioId: window.DiaconiaAuth?.sessao?.()?.usuarioId,
      meta: { arquivoId: id },
    });
    return { ok: true, qtd, conflito };
  }

  function gerarPdf(state, id) {
    const item = get(state, id);
    if (!item) return { ok: false, erro: "Arquivo não encontrado." };
    const PDF = window.DiaconiaPDF;
    if (!PDF?.prepararLista || !PDF?.gerarComPreparacao) {
      return { ok: false, erro: "Serviço de PDF indisponível." };
    }
    const lista = (item.datas || []).map((d) => item.escalas[d]).filter(Boolean);
    if (!lista.length) return { ok: false, erro: "Este arquivo está vazio." };
    const fake = { ...state, escalas: { ...(state.escalas || {}), ...item.escalas } };
    const quando = item.em ? new Date(item.em).toLocaleString("pt-BR") : "";
    const titulo = `Arquivo de escala${quando ? ` — ${quando}` : ""}`;
    return PDF.gerarComPreparacao(
      PDF.prepararLista(fake, lista, titulo, { grade: lista.length > 1 })
    );
  }

  return {
    MOTIVOS,
    LIMITE,
    ensure,
    motivoInfo,
    datasPeriodo,
    guardar,
    guardarDatas,
    get,
    listar,
    excluirArquivo,
    excluirDias,
    restaurar,
    gerarPdf,
  };
})();
