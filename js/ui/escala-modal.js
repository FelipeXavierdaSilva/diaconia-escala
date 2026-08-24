/**
 * Modal compartilhado: escala completa do dia + ações.
 */
window.DiaconiaEscalaModal = (() => {
  const UI = () => window.DiaconiaUI;
  const Cal = () => window.DiaconiaCalendar;
  const Engine = () => window.DiaconiaEngine;

  function render(state, data, { diaconoId = null, isLider = false, onChange } = {}) {
    const esc = state.escalas[data];
    if (!esc) {
      UI().toast("Escala não encontrada.");
      return;
    }

    const st = Engine().statusEscala(esc, state);
    const problemas = esc.problemas || [];
    const afetada = esc.status === "afetada" || esc.alertaAfetacao;

    const eqResp = (esc.equipesIds || [])[0];
    const nomeEqRespRaw = eqResp ? UI().nomeEquipe(state, eqResp) : "";
    const nomeEqRespPub = eqResp ? UI().nomeEquipePublico(state, eqResp) : "";
    const nomeEqResp = isLider ? nomeEqRespRaw || "—" : nomeEqRespPub;

    // Slot do diácono logado (se houver)
    let minhaFn = null;
    let minhaEq = null;
    if (diaconoId && !isLider) {
      for (const eqId of esc.equipesIds || []) {
        for (const fid of esc.funcoesIds || []) {
          const ids = esc.atribuicoes?.[eqId]?.[fid] || [];
          if (ids.includes(diaconoId)) {
            minhaFn = fid;
            minhaEq = eqId;
            break;
          }
        }
        if (minhaFn) break;
      }
    }

    let body = `
      <div class="panel-head" style="margin-bottom:8px">
        <div>
          <h2>${isLider ? "Escala" : "Culto"} — ${UI().esc(Cal().formatBR(data))}</h2>
          <p class="muted" style="margin:0">${UI().esc(Cal().diaSemana(data))} · ${UI().esc(esc.nome)} · ${UI().esc(esc.horario)}${isLider ? ` · ${UI().badgeStatus(st)}` : ""}</p>
          ${
            isLider || nomeEqResp
              ? `<p style="margin:8px 0 0"><strong>Equipe do dia:</strong> ${UI().esc(nomeEqResp || "—")}</p>`
              : ""
          }
            ${
              isLider
                ? `<div class="toolbar" style="margin-top:10px">
                  <button class="btn btn-accent btn-sm" data-act="editar-dia">✏️ Editar data e equipe</button>
                  ${
                    eqResp
                      ? `<button class="btn btn-primary btn-sm" data-act="montar-manual" data-eq="${eqResp}">✍️ Montar manualmente</button>`
                      : ""
                  }
                </div>`
              : ""
          }
        </div>
      </div>
    `;

    if (!isLider && diaconoId) {
      if (minhaFn) {
        const f = Engine().getFuncao(state, minhaFn);
        body += `
          <div class="panel sua-funcao-box" style="margin-bottom:14px">
            <p class="eyebrow" style="margin:0 0 6px;font-size:11px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--teal)">Sua função neste culto</p>
            <h3 style="margin:0 0 6px">${UI().esc((f?.emoji || "") + " " + (f?.nome || ""))}</h3>
            <p class="muted" style="margin:0">Chegar às <strong>${UI().esc(f?.horario || esc.horario)}</strong>${
              UI().nomeEquipePublico(state, minhaEq)
                ? ` · ${UI().esc(UI().nomeEquipePublico(state, minhaEq))}`
                : ""
            }</p>
            ${
              f?.instrucoes
                ? `<p style="margin:12px 0 0;font-size:14px">${UI().esc(f.instrucoes)}</p>`
                : ""
            }
          </div>`;
      } else {
        body += `
          <div class="alert alert-info" style="margin-bottom:14px">
            Você <strong>não está escalado</strong> neste culto. Abaixo está a escala da equipe do dia.
          </div>`;
      }
    }

    if (afetada && isLider) {
      body += `
        <div class="alert alert-danger">
          <strong>ESCALA AFETADA</strong><br/>
          ${UI().esc(esc.alertaAfetacao?.mensagem || "Uma restrição aprovada afeta esta escala.")}
          <div class="modal-actions" style="justify-content:flex-start;margin-top:10px">
            <button class="btn btn-accent" data-act="reorg">🔄 Reorganizar esta escala</button>
          </div>
        </div>`;
    }

    if (problemas.length && isLider) {
      body += `<div class="problem-box"><strong>🔴 Escala incompleta</strong>`;
      for (const p of problemas) {
        body += `<p style="margin:8px 0 0">${UI().esc(p.mensagem)}</p>
          <ul>${(p.sugestoes || []).map((s) => `<li>${UI().esc(s)}</li>`).join("")}</ul>`;
      }
      body += `</div>`;
    }

    const listaCompleta = (() => {
      let html = "";
      for (const eqId of esc.equipesIds || []) {
        const eq = state.equipes.find((e) => e.id === eqId);
        const stEq = Engine().statusEquipe(esc, eqId, state);
        html += `
        <div class="equipe-block">
          <div class="equipe-head">
            <h3>${UI().esc(eq?.nome || eqId)} ${isLider ? UI().badgeStatus(stEq === "completa" ? "completa" : stEq === "vazia" ? "rascunho" : "em_edicao") : ""}</h3>
            ${
              isLider
                ? `<div class="toolbar">
                    <button class="btn btn-ghost btn-sm" data-act="montar-manual" data-eq="${eqId}">✍️ Montar manualmente</button>
                    <button class="btn btn-ghost btn-sm" data-act="shuffle-eq" data-eq="${eqId}">🔀 Embaralhar equipe</button>
                  </div>`
                : ""
            }
          </div>`;

        for (const fid of esc.funcoesIds || []) {
          const f = Engine().getFuncao(state, fid);
          const ids = esc.atribuicoes?.[eqId]?.[fid] || [];
          const isMine = diaconoId && ids.includes(diaconoId);
          const nomes = ids.map((id) => UI().nomeDiacono(state, id)).join(" + ") || "—";

          html += `
          <div class="funcao-row ${isMine ? "mine" : ""}" data-fid="${fid}" data-eq="${eqId}">
            <div>
              <strong>${UI().esc((f?.emoji || "") + " " + (f?.nome || fid))}</strong>
              ${isMine ? `<div class="you-tag">VOCÊ</div>` : ""}
            </div>
            <div class="muted">${UI().esc(f?.horario || "")}</div>
            <div>${UI().esc(nomes)}</div>
            <div class="toolbar">
              ${
                isMine || isLider
                  ? `<button class="btn btn-ghost btn-sm" data-act="detalhe" data-fid="${fid}" data-eq="${eqId}">📖</button>`
                  : ""
              }
              ${
                isLider
                  ? `<button class="btn btn-ghost btn-sm" data-act="alterar" data-fid="${fid}" data-eq="${eqId}">🔄 Alterar</button>`
                  : ""
              }
            </div>
          </div>`;
        }
        html += `</div>`;
      }
      return html;
    })();

    if (isLider) {
      body += listaCompleta;
    } else {
      body += `
        <details class="adv-details escala-completa-details">
          <summary>Ver escala completa do dia</summary>
          <div style="margin-top:12px">${listaCompleta}</div>
        </details>`;
    }

    body += `
      <div class="modal-actions">
        ${isLider ? `<button class="btn btn-danger" data-act="excluir-dia" style="margin-right:auto">Excluir escala</button>` : ""}
        ${isLider ? `<button class="btn btn-ghost" data-act="pdf">📄 Gerar PDF</button>` : ""}
        <button class="btn btn-primary" data-act="fechar">Fechar</button>
      </div>`;

    const root = UI().openModal(body, { wide: true });

    root.addEventListener("click", async (e) => {
      const btn = e.target.closest("[data-act]");
      if (!btn) return;
      const act = btn.dataset.act;

      if (act === "fechar") {
        UI().closeModal();
        return;
      }
      if (act === "pdf") {
        const res = window.DiaconiaPDF.gerarEscala(state, data);
        if (res?.ok === false) UI().toast(res.erro || "Esta escala ainda não foi gerada.");
        return;
      }
      if (act === "editar-dia" && isLider) {
        editarDiaEquipe(state, data, { diaconoId, isLider, onChange });
        return;
      }
      if (act === "montar-manual" && isLider) {
        montarManual(state, data, btn.dataset.eq, {
          onDone: () => {
            onChange?.();
            render(state, data, { diaconoId, isLider, onChange });
          },
        });
        return;
      }
      if (act === "excluir-dia" && isLider) {
        const ok = await UI().confirmDelete({
          itemLabel: `a escala de <strong>${UI().esc(Cal().formatBR(data))}</strong>`,
          detalhes: "As atribuições deste dia serão removidas. Restrições pessoais da data permanecem.",
        });
        if (!ok) return;
        const res = Engine().excluirEscalaDia(state, data);
        if (!res.ok) return UI().toast(res.erro);
        window.DiaconiaHistory.add(state, {
          tipo: "escala",
          mensagem: `Escala excluída: ${data}.`,
          usuarioId: window.DiaconiaAuth.sessao()?.usuarioId,
        });
        UI().closeModal();
        onChange?.();
        UI().toast("Escala excluída.");
        return;
      }
      if (act === "shuffle-eq" && isLider) {
        const ok = await UI().confirmModal({
          title: "Embaralhar equipe",
          body: `<p>Gerar nova distribuição apenas para <strong>${UI().esc(UI().nomeEquipe(state, btn.dataset.eq))}</strong> em ${UI().esc(Cal().formatBR(data))}?</p>
            <p class="muted">Restrições aprovadas continuam valendo.</p>`,
          okText: "Embaralhar",
        });
        if (!ok) return;
        Engine().gerarEscalaData(state, data, { equipesIds: [btn.dataset.eq] });
        window.DiaconiaHistory.add(state, {
          tipo: "embaralhar",
          mensagem: `Equipe ${btn.dataset.eq} embaralhada em ${data}.`,
          usuarioId: window.DiaconiaAuth.sessao()?.usuarioId,
        });
        onChange?.();
        render(state, data, { diaconoId, isLider, onChange });
        UI().toast("Equipe embaralhada.");
        return;
      }
      if (act === "reorg" && isLider) {
        Engine().gerarEscalaData(state, data);
        delete esc.alertaAfetacao;
        esc.status = Engine().statusEscala(esc, state);
        window.DiaconiaHistory.add(state, {
          tipo: "reorganizar",
          mensagem: `Escala ${data} reorganizada após restrição.`,
          usuarioId: window.DiaconiaAuth.sessao()?.usuarioId,
        });
        onChange?.();
        render(state, data, { diaconoId, isLider, onChange });
        UI().toast("Escala reorganizada.");
        return;
      }
      if (act === "detalhe") {
        showDetalheFuncao(state, data, btn.dataset.eq, btn.dataset.fid, diaconoId);
        return;
      }
      if (act === "alterar" && isLider) {
        showAlterar(state, data, btn.dataset.eq, btn.dataset.fid, () => {
          onChange?.();
          render(state, data, { diaconoId, isLider, onChange });
        });
      }
    });
  }

  function editarDiaEquipe(state, data, { diaconoId = null, isLider = true, onChange } = {}) {
    const esc = state.escalas[data];
    if (!esc) return;

    const atualEq = esc.equipesIds?.[0];
    const eqs = (state.equipes || [])
      .filter((e) => e.ativa !== false)
      .map(
        (e) =>
          `<label><input type="radio" name="eq-dia" value="${e.id}" ${e.id === atualEq ? "checked" : ""}/> ${UI().esc(e.nome)}</label>`
      )
      .join("");

    UI().openModal(`
      <h2>✏️ Editar data e equipe</h2>
      <p class="muted">Altere o dia da escala e/ou a equipe responsável.</p>
      <label class="field"><span>Data</span><input type="date" id="ed-data" value="${UI().esc(data)}"/></label>
      <label class="field"><span>Nome</span><input id="ed-nome" value="${UI().esc(esc.nome || "")}"/></label>
      <label class="field"><span>Horário</span><input id="ed-hora" value="${UI().esc(esc.horario || "18:00")}"/></label>
      <label class="field"><span>Tipo</span>
        <select id="ed-tipo" class="select">
          <option value="culto" ${esc.tipo === "culto" ? "selected" : ""}>Culto</option>
          <option value="evento" ${esc.tipo === "evento" ? "selected" : ""}>Evento</option>
          <option value="especial" ${esc.tipo === "especial" ? "selected" : ""}>Especial</option>
        </select>
      </label>
      <p><strong>Equipe responsável do dia</strong></p>
      <div class="radio-list">${eqs}</div>
      <div class="alert alert-warn">Se mudar a equipe, as atribuições deste dia serão limpas (gere a escala de novo).</div>
      <div class="modal-actions">
        <button class="btn btn-ghost" data-act="cancel">Cancelar</button>
        <button class="btn btn-accent" data-act="salvar">Salvar</button>
      </div>
    `);

    const m = document.getElementById("modal-root");
    m.addEventListener("click", (ev) => {
      const a = ev.target.closest("[data-act]")?.dataset.act;
      if (a === "cancel") {
        UI().closeModal();
        render(state, data, { diaconoId, isLider, onChange });
        return;
      }
      if (a !== "salvar") return;

      const novaData = m.querySelector("#ed-data").value;
      const equipeId = m.querySelector('input[name="eq-dia"]:checked')?.value;
      if (!novaData) return UI().toast("Informe a data.");
      if (!equipeId) return UI().toast("Selecione a equipe.");

      const res = Engine().atualizarEscalaDia(state, data, {
        data: novaData,
        equipeId,
        nome: m.querySelector("#ed-nome").value.trim() || esc.nome,
        horario: m.querySelector("#ed-hora").value.trim() || esc.horario,
        tipo: m.querySelector("#ed-tipo").value,
      });

      if (!res.ok) return UI().toast(res.erro);

      window.DiaconiaHistory.add(state, {
        tipo: "escala",
        mensagem: `Escala atualizada: ${data}${res.dataMudou ? ` → ${res.data}` : ""} · ${UI().nomeEquipe(state, equipeId)}.`,
        usuarioId: window.DiaconiaAuth.sessao()?.usuarioId,
      });

      UI().closeModal();
      onChange?.();
      render(state, res.data, { diaconoId, isLider, onChange });
      UI().toast(
        res.equipeMudou
          ? "Salvo. Equipe alterada — gere/embaralhe as funções deste dia."
          : "Data e equipe atualizadas."
      );
    });
  }

  function showDetalheFuncao(state, data, equipeId, funcaoId, diaconoId) {
    const f = Engine().getFuncao(state, funcaoId);
    const ids = state.escalas[data]?.atribuicoes?.[equipeId]?.[funcaoId] || [];
    UI().openModal(`
      <h2>${UI().esc((f?.emoji || "") + " " + (f?.nome || "").toUpperCase())}</h2>
      <p><strong>Seu horário:</strong> ${UI().esc(f?.horario || "—")}</p>
      <p><strong>Responsáveis:</strong><br/>${ids.map((id) => UI().esc(UI().nomeDiacono(state, id))).join("<br/>") || "—"}</p>
      <div class="alert alert-info">
        <strong>📖 Instruções</strong><br/>
        ${UI().esc(f?.instrucoes || "Sem instruções cadastradas.")}
      </div>
      <div class="modal-actions">
        <button class="btn btn-primary" data-act="ok">Fechar</button>
      </div>
    `);
    document.getElementById("modal-root").addEventListener("click", (e) => {
      if (e.target.closest('[data-act="ok"]')) UI().closeModal();
    });
  }

  function montarManual(state, data, equipeId, { onDone } = {}) {
    const esc = state.escalas[data];
    if (!esc) return;

    const funcoesIds = esc.funcoesIds || state.funcoesPadraoCulto || [];
    const membros = Engine().diaconosDaEquipe(state, equipeId);
    const atuais = esc.atribuicoes?.[equipeId] || {};

    const blocos = funcoesIds
      .map((fid) => {
        const f = Engine().getFuncao(state, fid);
        if (!f) return "";
        const qtd = f.qtdPorEquipe || 1;
        const ids = atuais[fid] || [];
        const selects = Array.from({ length: qtd }, (_, i) => {
          const val = ids[i] || "";
          const opts = membros
            .map((d) => {
              const ok = Engine().candidatoValido(state, d, data, fid, new Set());
              const sel = d.id === val ? "selected" : "";
              const blocked = !ok ? "data-blocked=\"1\"" : "";
              const dis = !ok && d.id !== val ? "disabled" : "";
              const hint = !ok ? " (indisponível)" : "";
              return `<option value="${d.id}" ${sel} ${dis} ${blocked}>${UI().esc(d.nome)}${hint}</option>`;
            })
            .join("");
          return `<select class="input" data-fid="${fid}" data-slot="${i}">
            <option value="">— vazio —</option>
            ${opts}
          </select>`;
        }).join("");

        return `
          <div class="manual-funcao" style="margin-bottom:14px">
            <div style="margin-bottom:6px">
              <strong>${UI().esc((f.emoji || "") + " " + f.nome)}</strong>
              <span class="muted"> · ${UI().esc(f.horario || "")} · ${qtd} vaga(s)</span>
            </div>
            <div class="toolbar" style="flex-wrap:wrap;gap:8px">${selects}</div>
          </div>`;
      })
      .join("");

    UI().openModal(`
      <h2>✍️ Montar escala manualmente</h2>
      <p class="muted">${UI().esc(Cal().formatBR(data))} · ${UI().esc(UI().nomeEquipe(state, equipeId))}. A mesma pessoa pode assumir mais de uma função se aceitar.</p>
      <form id="form-manual">${blocos || `<p class="muted">Nenhuma função neste culto.</p>`}</form>
      <div class="modal-actions">
        <button class="btn btn-ghost" data-act="cancel">Cancelar</button>
        <button class="btn btn-accent" data-act="save">Salvar escala</button>
      </div>
    `);

    const root = document.getElementById("modal-root");
    const form = root.querySelector("#form-manual");

    const syncDisabled = () => {
      form.querySelectorAll("select").forEach((sel) => {
        const fid = sel.dataset.fid;
        const mine = sel.value;
        const picksMesmaFuncao = [...form.querySelectorAll(`select[data-fid="${fid}"]`)]
          .map((s) => s.value)
          .filter(Boolean);

        sel.querySelectorAll("option").forEach((opt) => {
          if (!opt.value) {
            opt.disabled = false;
            return;
          }
          if (opt.dataset.blocked === "1") {
            opt.disabled = opt.value !== mine;
            return;
          }
          // Só evita a mesma pessoa duas vezes na mesma função
          opt.disabled = picksMesmaFuncao.includes(opt.value) && opt.value !== mine;
        });
      });
    };

    form?.addEventListener("change", syncDisabled);
    syncDisabled();

    root.addEventListener("click", (e) => {
      const act = e.target.closest("[data-act]")?.dataset.act;
      if (act === "cancel") {
        UI().closeModal();
        return;
      }
      if (act !== "save") return;

      const atribuicoes = {};
      for (const fid of funcoesIds) {
        atribuicoes[fid] = [...form.querySelectorAll(`select[data-fid="${fid}"]`)]
          .map((s) => s.value)
          .filter(Boolean);
      }

      const res = Engine().salvarEscalaManual(state, data, equipeId, atribuicoes);
      if (!res.ok) {
        UI().toast(res.erro);
        return;
      }
      window.DiaconiaHistory.add(state, {
        tipo: "alteracao",
        mensagem: `Escala montada manualmente: ${equipeId} em ${data}.`,
        usuarioId: window.DiaconiaAuth.sessao()?.usuarioId,
      });
      UI().closeModal();
      UI().toast(
        res.problemas?.length
          ? "Escala salva com vagas em aberto."
          : "Escala manual salva."
      );
      onDone?.();
    });
  }

  function showAlterar(state, data, equipeId, funcaoId, onDone) {
    const f = Engine().getFuncao(state, funcaoId);
    const atuais = state.escalas[data]?.atribuicoes?.[equipeId]?.[funcaoId] || [];
    const qtd = f?.qtdPorEquipe || 1;
    const candidatos = Engine().candidatosParaFuncao(state, data, equipeId, funcaoId);

    let opts = candidatos
      .map(
        (d) =>
          `<label><input type="checkbox" name="pick" value="${d.id}" ${atuais.includes(d.id) ? "checked" : ""}/> ${UI().esc(d.nome)}</label>`
      )
      .join("");

    if (!opts) opts = `<p class="muted">Nenhum candidato válido no momento.</p>`;

    UI().openModal(`
      <h2>🔄 Alterar — ${UI().esc(f?.nome || "")}</h2>
      <p class="muted">Selecione até ${qtd} diácono(s). O sistema valida restrições, horário e permissões.</p>
      <div class="check-list" id="pick-list">${opts}</div>
      <div class="modal-actions">
        <button class="btn btn-ghost" data-act="cancel">Cancelar</button>
        <button class="btn btn-accent" data-act="save">Salvar</button>
      </div>
    `);

    const root = document.getElementById("modal-root");
    root.addEventListener("click", (e) => {
      const act = e.target.closest("[data-act]")?.dataset.act;
      if (act === "cancel") {
        UI().closeModal();
        return;
      }
      if (act === "save") {
        const picks = [...root.querySelectorAll('input[name="pick"]:checked')].map((i) => i.value);
        if (picks.length > qtd) {
          UI().toast(`Máximo de ${qtd} pessoa(s).`);
          return;
        }
        const res = Engine().alterarAtribuicao(state, data, equipeId, funcaoId, picks);
        if (!res.ok) {
          UI().toast(res.erro);
          return;
        }
        window.DiaconiaHistory.add(state, {
          tipo: "alteracao",
          mensagem: `Atribuição alterada: ${funcaoId} em ${data}.`,
          usuarioId: window.DiaconiaAuth.sessao()?.usuarioId,
        });
        UI().closeModal();
        UI().toast("Atribuição atualizada.");
        onDone?.();
      }
    });
  }

  return { render, editarDiaEquipe, montarManual, showDetalheFuncao, showAlterar };
})();
