/**
 * Geração de PDF via janela de impressão (sem dependências).
 * Inclui escalas cadastradas — mesmo incompletas (com aviso na UI).
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
        const qtd = f?.qtdPorEquipe || 1;
        const ids = esc.atribuicoes?.[eqId]?.[fid] || [];
        if (ids.length < qtd) return true;
      }
    }
    return false;
  }

  function htmlEscala(state, escala) {
    const CalX = Cal();
    const incompleta = escalaIncompleta(state, escala);
    const st = Engine().statusEscala?.(escala, state);
    const labelSt = Engine().labelStatus?.(st)?.texto || st || "";

    let html = `<h1>Escala — ${CalX.formatBR(escala.data)}</h1>
      <p><strong>${escala.nome || "Culto"}</strong> · ${CalX.diaSemana(escala.data)} · ${escala.horario || ""}`;
    if (incompleta) {
      html += ` · <em style="color:#a15c00">Incompleta${labelSt ? ` (${labelSt})` : ""}</em>`;
    }
    html += `</p>`;

    const eqs = escala.equipesIds || [];
    if (!eqs.length) {
      html += `<p><em>Sem equipe definida neste dia.</em></p>`;
      return html;
    }

    for (const eqId of eqs) {
      const eq = state.equipes.find((e) => e.id === eqId);
      html += `<h2>${eq?.nome || eqId}</h2><table><thead><tr><th>Função</th><th>Horário</th><th>Responsáveis</th></tr></thead><tbody>`;
      for (const fid of escala.funcoesIds || state.funcoesPadraoCulto || []) {
        const f = Engine().getFuncao(state, fid);
        if (f && f.ativo === false) continue;
        const ids = escala.atribuicoes?.[eqId]?.[fid] || [];
        const nomes = ids.map((id) => nomeDiacono(state, id)).join(", ") || "—";
        const vazio = !ids.length;
        html += `<tr${vazio ? ' style="background:#fff8e8"' : ""}><td>${f?.emoji || ""} ${f?.nome || fid}</td><td>${f?.horario || ""}</td><td>${nomes}</td></tr>`;
      }
      html += `</tbody></table>`;
    }

    if (escala.problemas?.length) {
      html += `<p style="font-size:12px;color:#a15c00"><strong>Pendências:</strong> ${escala.problemas
        .map((p) => p.mensagem)
        .join(" · ")}</p>`;
    }

    return html;
  }

  function prepararLista(state, lista, titulo) {
    const incompletas = lista.filter((e) => escalaIncompleta(state, e));
    let html = `<h1>${titulo}</h1>`;
    if (!lista.length) {
      html += `<p>Nenhuma escala cadastrada neste período.</p>`;
    } else {
      if (incompletas.length) {
        html += `<p style="font-size:13px;color:#a15c00"><strong>Atenção:</strong> ${incompletas.length} de ${lista.length} escala(s) incompleta(s) — vagas em aberto aparecem como “—”.</p>`;
      }
      for (const esc of lista) html += htmlEscala(state, esc) + "<hr/>";
    }
    return {
      titulo,
      html,
      total: lista.length,
      incompletas: incompletas.length,
      avisos: montarAvisos(lista.length, incompletas.length),
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
    return prepararLista(state, lista, `Escala mensal — ${Cal().nomeMes(mes)} ${ano}`);
  }

  function prepararTudo(state) {
    const datas = Object.keys(state.escalas || {}).sort();
    const lista = datas.map((d) => state.escalas[d]).filter(Boolean);
    return prepararLista(state, lista, "Escala completa");
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
      };
    }
    const incompleta = escalaIncompleta(state, esc);
    return {
      titulo: `Escala ${data}`,
      html: htmlEscala(state, esc),
      total: 1,
      incompletas: incompleta ? 1 : 0,
      avisos: incompleta
        ? ["Esta escala está incompleta. O PDF será gerado com as vagas em aberto."]
        : [],
    };
  }

  function imprimir(titulo, corpoHtml) {
    const w = window.open("", "_blank");
    if (!w) {
      return { ok: false, erro: "Permita pop-ups para gerar o PDF." };
    }
    w.document.write(`<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"/>
      <title>${titulo}</title>
      <style>
        body{font-family:Georgia,serif;padding:24px;color:#1a1a1a}
        h1{font-size:22px} h2{font-size:16px;margin-top:20px}
        table{width:100%;border-collapse:collapse;margin:8px 0 16px}
        th,td{border:1px solid #ccc;padding:6px 8px;text-align:left;font-size:12px}
        th{background:#f0f0f0}
        hr{border:none;border-top:1px solid #ddd;margin:28px 0}
        @media print{body{padding:0}}
      </style></head><body>${corpoHtml}
      <script>window.onload=()=>{window.print();}<\/script>
      </body></html>`);
    w.document.close();
    return { ok: true };
  }

  function gerarComPreparacao(prep) {
    const print = imprimir(prep.titulo, prep.html);
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
      prepararLista(state, todas, `Escala — ${qtd} mês(es)`)
    );
  }

  return {
    escalasDoMes,
    escalaIncompleta,
    prepararMes,
    prepararTudo,
    prepararEscala,
    imprimir,
    gerarEscala,
    gerarMes,
    gerarPeriodo,
    gerarTudo,
  };
})();
