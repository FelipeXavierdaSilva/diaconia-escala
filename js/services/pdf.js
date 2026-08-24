/**

 * Geração de PDF via janela de impressão (sem dependências).

 * Inclui apenas escalas geradas pelo botão "Gerar escala" (escala.gerada === true).

 */

window.DiaconiaPDF = (() => {

  const Cal = () => window.DiaconiaCalendar;

  const Engine = () => window.DiaconiaEngine;



  function nomeDiacono(state, id) {

    return state.diaconos.find((d) => d.id === id)?.nome || id;

  }



  function escalasGeradas(state, ano, mes) {

    if (typeof Engine().escalasGeradasDoMes === "function") {

      return Engine().escalasGeradasDoMes(state, ano, mes);

    }

    return Cal().escalasDoMes(state, ano, mes).filter((e) => e.gerada === true);

  }



  function htmlEscala(state, escala) {

    const CalX = Cal();

    let html = `<h1>Escala — ${CalX.formatBR(escala.data)}</h1>

      <p><strong>${escala.nome}</strong> · ${CalX.diaSemana(escala.data)} · ${escala.horario}</p>`;



    for (const eqId of escala.equipesIds || []) {

      const eq = state.equipes.find((e) => e.id === eqId);

      html += `<h2>${eq?.nome || eqId}</h2><table><thead><tr><th>Função</th><th>Horário</th><th>Responsáveis</th></tr></thead><tbody>`;

      for (const fid of escala.funcoesIds || []) {

        const f = Engine().getFuncao(state, fid);

        const ids = escala.atribuicoes?.[eqId]?.[fid] || [];

        html += `<tr><td>${f?.emoji || ""} ${f?.nome || fid}</td><td>${f?.horario || ""}</td><td>${ids.map((id) => nomeDiacono(state, id)).join(", ") || "—"}</td></tr>`;

      }

      html += `</tbody></table>`;

    }

    return html;

  }



  function htmlMes(state, ano, mes) {

    const lista = escalasGeradas(state, ano, mes);

    let html = `<h1>Escala mensal — ${Cal().nomeMes(mes)} ${ano}</h1>`;

    for (const esc of lista) html += htmlEscala(state, esc) + "<hr/>";

    return html;

  }



  function htmlPeriodo(state, anoInicio, mesInicio, qtdMeses) {

    let html = "";

    let ano = anoInicio;

    let mes = mesInicio;

    const qtd = Math.min(12, Math.max(1, Number(qtdMeses) || 1));

    let incluidos = 0;

    for (let i = 0; i < qtd; i++) {

      const lista = escalasGeradas(state, ano, mes);

      if (lista.length) {

        if (incluidos) html += '<hr style="margin:32px 0;border:none;border-top:2px solid #ccc"/>';

        html += htmlMes(state, ano, mes);

        incluidos += 1;

      }

      mes += 1;

      if (mes > 12) {

        mes = 1;

        ano += 1;

      }

    }

    return incluidos

      ? html

      : `<p>Nenhuma escala cadastrada neste período.</p>`;

  }



  function htmlTudo(state) {

    const datas = Object.keys(state.escalas || {})

      .filter((d) => state.escalas[d]?.gerada === true)

      .sort();

    if (!datas.length) {

      return `<p>Nenhuma escala cadastrada.</p>`;

    }

    const mesesVistos = new Set();

    let html = "";

    let incluidos = 0;

    for (const data of datas) {

      const [ano, mes] = data.split("-").map(Number);

      const chave = `${ano}-${mes}`;

      if (mesesVistos.has(chave)) continue;

      mesesVistos.add(chave);

      const lista = escalasGeradas(state, ano, mes);

      if (!lista.length) continue;

      if (incluidos) html += '<hr style="margin:32px 0;border:none;border-top:2px solid #ccc"/>';

      html += htmlMes(state, ano, mes);

      incluidos += 1;

    }

    return html;

  }



  function imprimir(titulo, corpoHtml) {

    const w = window.open("", "_blank");

    if (!w) {

      alert("Permita pop-ups para gerar o PDF.");

      return false;

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

      <script>window.onload=()=>{window.print();}</script>

      </body></html>`);

    w.document.close();

    return true;

  }



  function contemEscalasGeradas(corpoHtml) {

    return corpoHtml && !corpoHtml.includes("Nenhuma escala cadastrada");

  }



  function gerarEscala(state, data) {

    const esc = state.escalas[data];

    if (!esc?.gerada) return { ok: false, erro: "Esta data ainda não foi gerada. Use Gerar escala." };

    imprimir(`Escala ${data}`, htmlEscala(state, esc));

    return { ok: true };

  }



  function gerarMes(state, ano, mes) {

    const html = htmlMes(state, ano, mes);

    if (!escalasGeradas(state, ano, mes).length) {

      return { ok: false, erro: "Nenhuma escala cadastrada neste mês." };

    }

    imprimir(`Escala ${mes}/${ano}`, html);

    return { ok: true };

  }



  function gerarPeriodo(state, anoInicio, mesInicio, qtdMeses) {

    const qtd = Math.min(12, Math.max(1, Number(qtdMeses) || 1));

    const html = htmlPeriodo(state, anoInicio, mesInicio, qtd);

    if (!contemEscalasGeradas(html)) {

      return { ok: false, erro: "Nenhuma escala cadastrada no período." };

    }

    imprimir(`Escala — ${qtd} mês(es)`, html);

    return { ok: true };

  }



  function gerarTudo(state) {

    const html = htmlTudo(state);

    if (!contemEscalasGeradas(html)) {

      return { ok: false, erro: "Nenhuma escala cadastrada." };

    }

    imprimir("Escala completa", html);

    return { ok: true };

  }



  return { gerarEscala, gerarMes, gerarPeriodo, gerarTudo };

})();


