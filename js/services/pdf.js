/**
 * Geração de PDF via janela de impressão (sem dependências).
 * Layout mensal compacto (grade, paisagem) — sem coluna Horário.
 */
window.DiaconiaPDF = (() => {
  const Cal = () => window.DiaconiaCalendar;
  const Engine = () => window.DiaconiaEngine;

  function nomeDiacono(state, id) {
    return state.diaconos.find((d) => d.id === id)?.nome || id;
  }

  /** Todas as escalas do mês (cadastradas), não só as “geradas”. */
  function escalasDoMes(state, ano, mes) {
    return Cal().escalasDoMes(state, ano, mes);
  }

  function escalaIncompleta(state, esc) {
    if (!esc) return true;
    const st = Engine().statusEscala?.(esc, state);
    if (st === "incompleta" || st === "rascunho" || st === "em_edicao") return true;
    if (esc.problemas?.length) return true;
    const eqs = esc.equipesIds || [];
    if (!eqs.length) return true;
    const funcoes = esc.funcoesIds || state.funcoesPadraoCulto || [];
    if (!funcoes.length) return false;
    for (const eqId of eqs) {
      for (const fid of funcoes) {
        const f = Engine().getFuncao(state, fid);
        if (f && f.ativo === false) continue;
        const qtd = Engine().qtdFuncaoNaEscala?.(state, esc, fid) ?? f?.qtdPorEquipe ?? 1;
        const ids = esc.atribuicoes?.[eqId]?.[fid] || [];
        if (ids.length < qtd) return true;
      }
    }
    return false;
  }

  function lideresDaEquipe(state, eqId) {
    const eq = state.equipes.find((e) => e.id === eqId);
    if (!eq) return "";
    const ids = eq.lideresIds || eq.liderIds || [];
    if (ids.length) {
      return ids.map((id) => nomeDiacono(state, id)).filter(Boolean).join(", ");
    }
    return "";
  }

  /** Cores estáveis por equipe (impressão / PDF). */
  const CORES_EQUIPE = ["#0f4c5c", "#1d4e89", "#3d6b4f", "#6b3d5a", "#8a4a22", "#2f5d62"];

  function corEquipe(state, eqId) {
    if (typeof window.DiaconiaUI?.corEquipe === "function") {
      return window.DiaconiaUI.corEquipe(state, eqId);
    }
    const eqs = state.equipes || [];
    const eq = eqs.find((e) => e.id === eqId);
    const hex = String(eq?.cor || "").trim();
    if (/^#[0-9a-fA-F]{6}$/.test(hex)) return hex.toLowerCase();
    const idx = eqs.findIndex((e) => e.id === eqId);
    return CORES_EQUIPE[(idx < 0 ? 0 : idx) % CORES_EQUIPE.length];
  }

  function funcoesIdsPdf(state, escala) {
    if (typeof Engine().funcoesDaEscala === "function") {
      return Engine().funcoesDaEscala(state, escala);
    }
    return escala.funcoesIds || state.funcoesPadraoCulto || [];
  }

  /**
   * Card de uma escala (Função | Responsáveis — sem Horário).
   * @param {{ compact?: boolean }} opts
   */
  function htmlEscalaCard(state, escala, opts = {}) {
    const CalX = Cal();
    const incompleta = escalaIncompleta(state, escala);
    const eqs = escala.equipesIds || [];
    const eqId = eqs[0];
    const eq = eqId ? state.equipes.find((e) => e.id === eqId) : null;
    const lideres = eqId ? lideresDaEquipe(state, eqId) : "";
    const cor = corEquipe(state, eqId);

    let html = `<article class="esc-card${incompleta ? " is-incompleta" : ""}">
      <header class="esc-card-head" style="background:${cor}">
        <div class="esc-card-date">${CalX.formatBR(escala.data)} · ${CalX.diaSemana(escala.data)}</div>
        <div class="esc-card-meta">${escala.nome || "Culto"}${eq?.nome ? ` · ${eq.nome}` : ""}${
      incompleta ? ` · <em>Incompleta</em>` : ""
    }</div>
        ${lideres ? `<div class="esc-card-lideres">Líderes: ${lideres}</div>` : ""}
      </header>`;

    if (!eqs.length) {
      html += `<p class="esc-empty">Sem equipe definida.</p></article>`;
      return html;
    }

    const funcoesIds = funcoesIdsPdf(state, escala);
    for (const eid of eqs) {
      const eObj = state.equipes.find((e) => e.id === eid);
      const corEq = corEquipe(state, eid);
      if (eqs.length > 1) {
        html += `<div class="esc-eq-nome" style="background:${corEq};color:#fff">${eObj?.nome || eid}</div>`;
      }
      html += `<table class="esc-table"><thead><tr><th>Função</th><th>Responsáveis</th></tr></thead><tbody>`;
      for (const fid of funcoesIds) {
        const f = Engine().getFuncao(state, fid);
        if (f && f.ativo === false) continue;
        const ids = escala.atribuicoes?.[eid]?.[fid] || [];
        const nomes = ids.map((id) => nomeDiacono(state, id)).join(", ") || "—";
        const vazio = !ids.length;
        const emoji = f?.emoji ? `<span class="fn-ico">${f.emoji}</span>` : "";
        html += `<tr class="${vazio ? "row-vazio" : ""}"><td>${emoji}${f?.nome || fid}</td><td>${nomes}</td></tr>`;
      }
      html += `</tbody></table>`;
    }

    return html + `</article>`;
  }

  /** @deprecated use htmlEscalaCard — mantido para compat de chamadas antigas */
  function htmlEscala(state, escala) {
    return htmlEscalaCard(state, escala, { compact: false });
  }

  function colunasGrade(qtd) {
    if (qtd <= 1) return 1;
    if (qtd === 2) return 2;
    if (qtd <= 4) return 2;
    return 3;
  }

  function prepararLista(state, lista, titulo, opts = {}) {
    const incompletas = lista.filter((e) => escalaIncompleta(state, e));
    const grade = opts.grade !== false && lista.length > 1;
    const cols = colunasGrade(lista.length);

    let html = `<header class="doc-head"><h1>${titulo}</h1>`;
    if (lista.length && incompletas.length) {
      html += `<p class="doc-aviso"><strong>Atenção:</strong> ${incompletas.length} de ${lista.length} escala(s) incompleta(s) — vagas em aberto aparecem como “—”.</p>`;
    }
    html += `</header>`;

    if (!lista.length) {
      html += `<p>Nenhuma escala cadastrada neste período.</p>`;
    } else if (grade) {
      html += `<div class="esc-grid cols-${cols}">`;
      for (const esc of lista) html += htmlEscalaCard(state, esc, { compact: true });
      html += `</div>`;
    } else {
      for (const esc of lista) {
        html += `<div class="esc-folha">${htmlEscalaCard(state, esc, { compact: false })}</div>`;
      }
    }

    return {
      titulo,
      html,
      total: lista.length,
      incompletas: incompletas.length,
      avisos: montarAvisos(lista.length, incompletas.length),
      landscape: grade && lista.length >= 2,
      grade,
    };
  }

  function montarAvisos(total, incompletas) {
    const avisos = [];
    if (!total) {
      avisos.push("Não há escalas cadastradas neste período. O PDF sairá praticamente vazio.");
    } else if (incompletas > 0) {
      avisos.push(
        `${incompletas} escala(s) ainda incompleta(s) (vagas sem pessoa). O PDF será gerado mesmo assim.`
      );
    }
    return avisos;
  }

  function prepararMes(state, ano, mes) {
    const lista = escalasDoMes(state, ano, mes);
    return prepararLista(state, lista, `Escala do diaconato — ${Cal().nomeMes(mes)} ${ano}`, {
      grade: true,
    });
  }

  function prepararTudo(state) {
    const datas = Object.keys(state.escalas || {}).sort();
    const lista = datas.map((d) => state.escalas[d]).filter(Boolean);
    // “Tudo” pode ser longo: agrupa por mês em grades
    const porMes = new Map();
    for (const esc of lista) {
      const [y, m] = String(esc.data).split("-");
      const key = `${y}-${m}`;
      if (!porMes.has(key)) porMes.set(key, []);
      porMes.get(key).push(esc);
    }
    const incompletas = lista.filter((e) => escalaIncompleta(state, e));
    let html = `<header class="doc-head"><h1>Escala completa</h1>`;
    if (incompletas.length) {
      html += `<p class="doc-aviso"><strong>Atenção:</strong> ${incompletas.length} de ${lista.length} escala(s) incompleta(s).</p>`;
    }
    html += `</header>`;
    if (!lista.length) {
      html += `<p>Nenhuma escala cadastrada.</p>`;
    } else {
      for (const [key, grupo] of porMes) {
        const [y, m] = key.split("-");
        const cols = colunasGrade(grupo.length);
        html += `<section class="mes-bloco">
          <h2 class="mes-titulo">${Cal().nomeMes(+m)} ${y}</h2>
          <div class="esc-grid cols-${cols}">`;
        for (const esc of grupo) html += htmlEscalaCard(state, esc, { compact: true });
        html += `</div></section>`;
      }
    }
    return {
      titulo: "Escala completa",
      html,
      total: lista.length,
      incompletas: incompletas.length,
      avisos: montarAvisos(lista.length, incompletas.length),
      landscape: lista.length >= 2,
      grade: true,
    };
  }

  function prepararEscala(state, data) {
    const esc = state.escalas[data];
    if (!esc) {
      return {
        titulo: `Escala ${data}`,
        html: `<p>Escala não encontrada para ${data}.</p>`,
        total: 0,
        incompletas: 0,
        avisos: ["Esta data não tem escala cadastrada."],
        landscape: false,
      };
    }
    const incompleta = escalaIncompleta(state, esc);
    return {
      titulo: `Escala ${data}`,
      html: htmlEscalaCard(state, esc, { compact: false }),
      total: 1,
      incompletas: incompleta ? 1 : 0,
      avisos: incompleta
        ? ["Esta escala está incompleta. O PDF será gerado com as vagas em aberto."]
        : [],
      landscape: false,
    };
  }

  function estilosImpressao({ landscape } = {}) {
    return `
      * { box-sizing: border-box; }
      html, body, .esc-card, .esc-card-head, .esc-eq-nome, .esc-table th, .esc-table td {
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
        color-adjust: exact;
      }
      body {
        font-family: "Segoe UI", "Segoe UI Emoji", "Noto Color Emoji", system-ui, sans-serif;
        margin: 0;
        padding: 10mm;
        color: #1a2a2e;
        font-size: 10px;
        line-height: 1.25;
      }
      .doc-head { margin-bottom: 8px; }
      .doc-head h1 {
        font-size: 16px;
        margin: 0 0 4px;
        letter-spacing: 0.02em;
        text-transform: uppercase;
      }
      .doc-aviso { margin: 0; font-size: 10px; color: #a15c00; }
      .mes-bloco { margin-top: 10px; page-break-inside: avoid; }
      .mes-titulo {
        font-size: 12px;
        margin: 0 0 6px;
        border-bottom: 1px solid #0f4c5c;
        padding-bottom: 2px;
        color: #0f4c5c;
      }
      .esc-grid {
        display: grid;
        gap: 8px;
        align-items: start;
      }
      .esc-grid.cols-1 { grid-template-columns: 1fr; }
      .esc-grid.cols-2 { grid-template-columns: 1fr 1fr; }
      .esc-grid.cols-3 { grid-template-columns: 1fr 1fr 1fr; }
      .esc-card {
        border: 1px solid #9aabb0;
        border-radius: 4px;
        overflow: hidden;
        background: #fff;
        page-break-inside: avoid;
        break-inside: avoid;
      }
      .esc-card.is-incompleta {
        border-color: #c47b16;
        box-shadow: inset 0 0 0 1.5px #c47b16;
      }
      .esc-card-head {
        background: #0f4c5c;
        color: #fff;
        padding: 5px 7px;
      }
      .esc-card-date { font-weight: 700; font-size: 11px; }
      .esc-card-meta { font-size: 9px; opacity: 0.92; margin-top: 1px; }
      .esc-card-meta em { font-style: normal; color: #ffd8a8; }
      .esc-card-lideres { font-size: 8px; opacity: 0.85; margin-top: 2px; }
      .esc-eq-nome {
        font-weight: 700;
        font-size: 9px;
        padding: 3px 7px;
        background: #0f4c5c;
        color: #fff;
      }
      .fn-ico {
        display: inline-block;
        min-width: 1.15em;
        margin-right: 4px;
        font-size: 11px;
        line-height: 1;
      }
      .esc-table {
        width: 100%;
        border-collapse: collapse;
      }
      .esc-table th,
      .esc-table td {
        border-bottom: 1px solid #d5dde0;
        padding: 2px 6px;
        text-align: left;
        vertical-align: top;
        font-size: 9px;
      }
      .esc-table th {
        background: #f3f6f7;
        font-size: 8px;
        text-transform: uppercase;
        letter-spacing: 0.03em;
        color: #445;
      }
      .esc-table th:first-child,
      .esc-table td:first-child { width: 42%; }
      .esc-table tr:nth-child(even) td { background: #f7fafb; }
      .esc-table tr.row-vazio td { background: #fff8e8; }
      .esc-empty { padding: 8px; margin: 0; font-style: italic; }
      .esc-folha { max-width: 520px; margin: 0 auto; }
      @page {
        size: ${landscape ? "A4 landscape" : "A4 portrait"};
        margin: 8mm;
      }
      @media print {
        body { padding: 0; }
        .esc-card { break-inside: avoid; page-break-inside: avoid; }
        .mes-bloco { break-inside: avoid; page-break-inside: avoid; }
        .esc-card-head, .esc-eq-nome, .esc-table th, .esc-table tr.row-vazio td {
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }
      }
    `.trim();
  }

  function imprimir(titulo, corpoHtml, opts = {}) {
    const w = window.open("", "_blank");
    if (!w) {
      return { ok: false, erro: "Permita pop-ups para gerar o PDF." };
    }
    const landscape = !!opts.landscape;
    w.document.write(`<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"/>
      <title>${titulo}</title>
      <style>${estilosImpressao({ landscape })}</style>
      </head><body>${corpoHtml}
      <script>window.onload=()=>{window.print();}<\/script>
      </body></html>`);
    w.document.close();
    return { ok: true };
  }

  function gerarComPreparacao(prep) {
    const print = imprimir(prep.titulo, prep.html, { landscape: prep.landscape });
    if (!print.ok) return print;
    return { ok: true, ...prep };
  }

  /** @deprecated prefer prepararMes + imprimir; mantido para compat */
  function gerarMes(state, ano, mes) {
    return gerarComPreparacao(prepararMes(state, ano, mes));
  }

  function gerarTudo(state) {
    return gerarComPreparacao(prepararTudo(state));
  }

  function gerarEscala(state, data) {
    return gerarComPreparacao(prepararEscala(state, data));
  }

  function gerarPeriodo(state, anoInicio, mesInicio, qtdMeses) {
    let ano = anoInicio;
    let mes = mesInicio;
    const qtd = Math.min(12, Math.max(1, Number(qtdMeses) || 1));
    const todas = [];
    for (let i = 0; i < qtd; i++) {
      todas.push(...escalasDoMes(state, ano, mes));
      mes += 1;
      if (mes > 12) {
        mes = 1;
        ano += 1;
      }
    }
    return gerarComPreparacao(
      prepararLista(state, todas, `Escala — ${qtd} mês(es)`, { grade: true })
    );
  }

  return {
    escalasDoMes,
    escalaIncompleta,
    prepararLista,
    prepararMes,
    prepararTudo,
    prepararEscala,
    imprimir,
    gerarComPreparacao,
    gerarEscala,
    gerarMes,
    gerarPeriodo,
    gerarTudo,
  };
})();
