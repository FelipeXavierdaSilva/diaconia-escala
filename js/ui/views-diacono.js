/**
 * Views do diácono — experiência enxuta:
 * Minha escala | Avisos | Minha conta
 */
window.DiaconiaViewsDiacono = (() => {
  const UI = () => window.DiaconiaUI;
  const Cal = () => window.DiaconiaCalendar;
  const Engine = () => window.DiaconiaEngine;

  function diaconoId(app) {
    return window.DiaconiaAuth.sessao()?.diaconoId;
  }

  function bindMes(app, root) {
    UI().bindMesNav(app, root);
  }

  function openEscala(app, data) {
    window.DiaconiaEscalaModal.render(app.state, data, {
      diaconoId: diaconoId(app),
      isLider: false,
      onChange: () => {
        app.save();
        app.render();
      },
    });
  }

  function labelStatusRestricao(st) {
    const map = {
      pendente: { texto: "Aguardando o líder", tom: "warn" },
      aprovada: { texto: "Confirmada", tom: "ok" },
      // Recusa da liderança não altera a escala — linguagem neutra no painel do diácono
      rejeitada: { texto: "Registrado", tom: "muted" },
    };
    const info = map[st] || { texto: st, tom: "muted" };
    const extra =
      st === "rejeitada"
        ? `<span class="muted" style="font-size:11px;display:block;margin-top:2px">Sua escala não foi alterada</span>`
        : "";
    return `<span class="badge badge-${info.tom}">${UI().esc(info.texto)}</span>${extra}`;
  }

  function acoesRestricao(r) {
    if (r.status === "rejeitada") {
      return `<span class="muted" style="font-size:12px">Escala mantida</span>
        ${UI().btnIcon({ icon: "trash", label: "Excluir", variant: "danger", attrs: { "data-act": "del-r", "data-id": r.id } })}`;
    }
    return `${UI().btnIcon({ icon: "pencil", label: "Editar", variant: "ghost", attrs: { "data-act": "edit-r", "data-id": r.id } })}
      ${UI().btnIcon({ icon: "trash", label: "Excluir", variant: "danger", attrs: { "data-act": "del-r", "data-id": r.id } })}`;
  }

  /* ——— Minha Escala (home unificada) ——— */
  function minhaEscala(app) {
    const { state, ano, mes } = app;
    const did = diaconoId(app);
    const d = state.diaconos.find((x) => x.id === did);
    const futuras = Engine().proximasEscalasDiacono(state, did);
    if (app.heroProxIdx == null || app.heroProxIdx < 0) app.heroProxIdx = 0;
    if (futuras.length && app.heroProxIdx >= futuras.length) app.heroProxIdx = futuras.length - 1;
    if (!futuras.length) app.heroProxIdx = 0;
    const hero = futuras[app.heroProxIdx] || null;
    const resumo = Engine().resumoMesDiacono(state, did, ano, mes);

    const pendentes = (state.trocas || []).filter(
      (t) => t.paraDiaconoId === did && t.status === "aguardando_aceite"
    ).length;
    const unread = (state.notificacoes || []).filter(
      (n) => n.usuarioId === window.DiaconiaAuth.sessao()?.usuarioId && !n.lida
    ).length;
    const avisosN = pendentes + unread;

    const parts = Engine().participacoesDoDiacono(state, did, ano, mes);
    const mapParts = {};
    for (const p of parts) {
      if (!mapParts[p.data]) mapParts[p.data] = [];
      mapParts[p.data].push(p);
    }

    const viagensMes = (state.restricoes || []).filter(
      (r) =>
        r.diaconoId === did &&
        r.motivoViagem &&
        r.status !== "rejeitada" &&
        Engine().datasDaRestricao(r).some((d) => d.startsWith(`${ano}-${String(mes).padStart(2, "0")}`))
    );
    const diasViagem = new Set();
    for (const v of viagensMes) {
      for (const d of Engine().datasDaRestricao(v)) diasViagem.add(d);
    }

    const grade = Cal().gradeMes(ano, mes);

    const cells = grade
      .map((iso) => {
        if (!iso) return `<div class="cal-day empty"></div>`;
        const day = +iso.split("-")[2];
        const ps = mapParts[iso];
        const esc = state.escalas[iso];
        const emViagem = diasViagem.has(iso);
        const classes = ["cal-day", "clickable"];
        if (ps?.length) classes.push("has-event", "mine-day");
        else if (esc) classes.push("has-event");
        if (emViagem) classes.push("away-day");

        let mark = "";
        let title = "Clique para informar viagem ou ver opções";
        if (ps?.length) {
          const emojis = ps
            .map((p) => Engine().getFuncao(state, p.funcaoId)?.emoji || "●")
            .join("");
          const nomes = ps
            .map((p) => Engine().getFuncao(state, p.funcaoId)?.nome || "")
            .filter(Boolean)
            .join(", ");
          mark = `<span class="cal-fn">${UI().esc(emojis)}</span>`;
          title = `${nomes}${emViagem ? " · Em viagem" : ""}`;
        } else if (emViagem) {
          mark = `<span class="mark mark-away"></span>`;
          title = "Você marcou viagem neste dia";
        } else if (esc) {
          mark = `<span class="mark" style="background:var(--muted)"></span>`;
          title = "Há culto — você não está escalado. Clique para informar viagem.";
        }

        return `<div class="${classes.join(" ")}" data-data="${iso}" title="${UI().esc(title)}"${esc && !ps?.length ? ' style="opacity:.65"' : ""}>
            <span class="n">${day}</span>
            ${mark}
          </div>`;
      })
      .join("");

    const porDia = [];
    for (const p of resumo.partes) {
      const last = porDia[porDia.length - 1];
      if (last && last.data === p.data) last.partes.push(p);
      else porDia.push({ data: p.data, partes: [p] });
    }
    const rows = porDia
      .map((dia) => {
        const fns = dia.partes
          .map((p) => {
            const fn = Engine().getFuncao(state, p.funcaoId);
            return `${fn?.emoji || ""} ${fn?.nome || ""}`.trim();
          })
          .join(" · ");
        const horas = [
          ...new Set(
            dia.partes.map((p) => {
              const fn = Engine().getFuncao(state, p.funcaoId);
              return fn?.horario || p.escala.horario || "";
            })
          ),
        ]
          .filter(Boolean)
          .join(" · ");
        return `<tr data-data="${dia.data}">
          <td>${UI().esc(Cal().formatBRCurto(dia.data))}<div class="muted" style="font-size:12px">${UI().esc(Cal().diaSemana(dia.data))}</div></td>
          <td><strong>${UI().esc(fns)}</strong></td>
          <td>${UI().esc(horas)}</td>
        </tr>`;
      })
      .join("");

    const heroFuncoesHtml = hero
      ? hero.partes
          .map((p) => {
            const fn = Engine().getFuncao(state, p.funcaoId);
            const eq = UI().nomeEquipePublico(state, p.equipeId);
            return `<div class="funcao-destaque-item">
              <div class="funcao-destaque-nome">${UI().esc((fn?.emoji || "") + " " + (fn?.nome || ""))}</div>
              <div class="funcao-destaque-hora">Chegar às ${UI().esc(fn?.horario || hero.escala.horario)}${
                eq ? ` · ${UI().esc(eq)}` : ""
              }</div>
            </div>`;
          })
          .join("")
      : "";

    const temProx = futuras.length > 1 && app.heroProxIdx < futuras.length - 1;
    const temAnt = app.heroProxIdx > 0;
    const chevron = (dir) =>
      dir === "next"
        ? `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="9 18 15 12 9 6"/></svg>`
        : `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="15 18 9 12 15 6"/></svg>`;

    return `
      <div class="topbar">
        <div>
          <h1>Olá, ${UI().esc(d?.nome || "")}</h1>
          <p class="sub">Quando você serve, o que faz e a que horas precisa chegar.</p>
        </div>
        <div class="toolbar">${UI().mesSelect(ano, mes)}</div>
      </div>

      ${
        avisosN
          ? `<div class="alert alert-warn diacono-alert" style="margin-bottom:14px">
              Você tem <strong>${avisosN}</strong> aviso(s) pendente(s).
              <button type="button" class="btn btn-ghost btn-sm" id="btn-ir-avisos" style="margin-left:8px">Ver avisos</button>
            </div>`
          : ""
      }

      <div class="grid grid-2 diacono-home-grid" style="margin-bottom:16px">
        <div class="panel hero-next">
          <p class="eyebrow" style="opacity:.85;letter-spacing:.12em;font-size:11px;font-weight:700;text-transform:uppercase;margin:0 0 6px">${
            app.heroProxIdx === 0 ? "Próximo culto" : "Culto escalado"
          }</p>
          ${
            hero
              ? `
            <div class="hero-next-title-row">
              ${
                temAnt
                  ? `<button type="button" class="hero-next-nav" id="btn-prox-culto-prev" title="Culto anterior escalado" aria-label="Culto anterior escalado">${chevron("prev")}</button>`
                  : ""
              }
              <h2 class="hero-next-date">${UI().esc(Cal().diaSemana(hero.data))} — ${UI().esc(Cal().formatBR(hero.data))}</h2>
              ${
                temProx
                  ? `<button type="button" class="hero-next-nav" id="btn-prox-culto-next" title="Próximo culto escalado" aria-label="Próximo culto escalado">${chevron("next")}</button>`
                  : ""
              }
            </div>
            <p class="meta">${UI().esc(hero.escala.nome)}${
              (() => {
                const eqs = [...new Set(hero.partes.map((p) => UI().nomeEquipePublico(state, p.equipeId)).filter(Boolean))];
                return eqs.length ? ` · ${UI().esc(eqs.join(", "))}` : "";
              })()
            }</p>
            <div class="funcao-destaque">
              <div class="funcao-destaque-label">${hero.partes.length > 1 ? "Suas funções" : "Sua função"}</div>
              ${heroFuncoesHtml}
            </div>
            <div class="toolbar" style="margin-top:14px">
              <button class="btn btn-accent" id="btn-det-prox" data-data="${hero.data}">Ver detalhes</button>
              <button class="btn btn-ghost" id="btn-nao-posso" data-data="${hero.data}">Não posso ir</button>
            </div>`
              : `<h2>Nenhum culto futuro</h2><p class="meta">Quando a liderança gerar a escala, ela aparece aqui.</p>`
          }
        </div>

        <div class="panel">
          <div class="panel-head"><h2>${UI().esc(Cal().nomeMes(mes))} ${ano}</h2></div>
          <p class="muted" style="margin:0 0 10px;font-size:13px">
            Destaque = você está escalado · Cinza = culto sem você ·
            <span class="cal-legenda-away">Laranja</span> = viagem.
            <strong>Clique em um dia</strong> para informar quantos dias estará fora.
          </p>
          <div class="cal-wrap">
            <div class="cal cal-fit cal-diacono">
              ${Cal().DIAS_CURTOS.map((x) => `<div class="cal-head">${x}</div>`).join("")}
              ${cells}
            </div>
          </div>
        </div>
      </div>

      <div class="panel" style="margin-bottom:16px">
        <div class="panel-head">
          <h2>Suas escalas neste mês</h2>
          <div class="toolbar">
            <button type="button" class="btn btn-ghost btn-sm" id="btn-atalho-rest">Avisar que não posso</button>
            <button type="button" class="btn btn-ghost btn-sm" id="btn-atalho-troca">Pedir cobertura</button>
          </div>
        </div>
        <div class="table-wrap">
          <table class="data">
            <thead><tr><th>Data</th><th>Sua função</th><th>Horário</th></tr></thead>
            <tbody id="tbl-minha">
              ${
                rows ||
                `<tr class="no-click"><td colspan="3" class="empty">Você ainda não está escalado neste mês.</td></tr>`
              }
            </tbody>
          </table>
        </div>
      </div>`;
  }

  function bindMinhaEscala(app, root) {
    bindMes(app, root);

    root.querySelector("#btn-ir-avisos")?.addEventListener("click", () => {
      app.page = "avisos";
      app.render();
    });

    root.querySelector("#btn-prox-culto-next")?.addEventListener("click", () => {
      app.heroProxIdx = (app.heroProxIdx || 0) + 1;
      app.render();
    });
    root.querySelector("#btn-prox-culto-prev")?.addEventListener("click", () => {
      app.heroProxIdx = Math.max(0, (app.heroProxIdx || 0) - 1);
      app.render();
    });

    root.querySelector("#btn-det-prox")?.addEventListener("click", (e) => {
      openEscala(app, e.currentTarget.dataset.data);
    });

    root.querySelector("#btn-nao-posso")?.addEventListener("click", (e) => {
      escolherMotivoNaoPosso(app, { data: e.currentTarget.dataset.data });
    });

    root.querySelector("#btn-atalho-rest")?.addEventListener("click", () => escolherMotivoNaoPosso(app));
    root.querySelector("#btn-atalho-troca")?.addEventListener("click", () => {
      formTroca(app);
    });

    root.querySelector("#tbl-minha")?.addEventListener("click", (e) => {
      const tr = e.target.closest("tr[data-data]");
      if (tr) openEscala(app, tr.dataset.data);
    });

    root.querySelectorAll(".cal-day[data-data]").forEach((el) => {
      el.addEventListener("click", () => abrirOpcoesDiaCalendario(app, el.dataset.data));
    });
  }

  function viagemQueCobre(state, did, data) {
    return (state.restricoes || []).find(
      (r) =>
        r.diaconoId === did &&
        r.motivoViagem &&
        r.status !== "rejeitada" &&
        Engine().restricaoCobreData(r, data)
    );
  }

  function abrirOpcoesDiaCalendario(app, data) {
    const { state } = app;
    const did = diaconoId(app);
    const esc = state.escalas[data];
    const minha = Engine().diaconoEstaEscaladoNaData(state, did, data);
    const viagem = viagemQueCobre(state, did, data);

    UI().openModal(`
      <h2>${UI().esc(Cal().formatBR(data))}</h2>
      <p class="muted" style="margin-top:0">${UI().esc(Cal().diaSemana(data))}${
        esc ? ` · ${UI().esc(esc.nome || "Culto")}` : ""
      }</p>
      <div class="choice-stack">
        <button type="button" class="btn btn-choice" data-act="viagem">
          <strong>${viagem ? "Editar / ver viagem" : "Informar viagem"}</strong>
          <span>${
            viagem
              ? `Período já marcado (${UI().esc(Cal().formatBR(viagem.data))}${
                  viagem.dataFim && viagem.dataFim !== viagem.data
                    ? ` a ${UI().esc(Cal().formatBR(viagem.dataFim))}`
                    : ""
                })`
              : "Trabalho ou familiar — quantos dias estará fora"
          }</span>
        </button>
        ${
          esc
            ? `<button type="button" class="btn btn-choice" data-act="escala">
                <strong>${minha ? "Ver minha escala" : "Ver culto do dia"}</strong>
                <span>${minha ? "Função e horário neste culto" : "Quem está escalado neste dia"}</span>
              </button>`
            : ""
        }
        ${
          minha
            ? `<button type="button" class="btn btn-choice" data-act="nao-posso">
                <strong>Não posso ir (só este culto)</strong>
                <span>Emergência, outro ministério ou pedir cobertura</span>
              </button>`
            : ""
        }
      </div>
      <div class="modal-actions">
        <button class="btn btn-ghost" data-act="cancel">Fechar</button>
      </div>
    `);

    const m = document.getElementById("modal-root");
    m.addEventListener("click", (e) => {
      const act = e.target.closest("[data-act]")?.dataset.act;
      if (act === "cancel") return UI().closeModal();
      if (act === "viagem") {
        UI().closeModal();
        formViagem(app, viagem || null, { data });
        return;
      }
      if (act === "escala") {
        UI().closeModal();
        openEscala(app, data);
        return;
      }
      if (act === "nao-posso") {
        UI().closeModal();
        escolherMotivoNaoPosso(app, { data });
      }
    });
  }

  function formViagem(app, restricao = null, opts = {}) {
    const { state } = app;
    const dataIni = restricao?.data || opts.data || Cal().hojeISO();
    const qtdAtual = restricao
      ? Engine().datasDaRestricao(restricao).length
      : 1;
    const motivo = restricao?.motivoViagem || "trabalho";
    const obsLivre = String(restricao?.observacao || "")
      .replace(/^Viagem a trabalho \(\d+ dias?\)\s*—?\s*/i, "")
      .replace(/^Viagem familiar \(\d+ dias?\)\s*—?\s*/i, "")
      .trim();

    UI().openModal(`
      <h2>${restricao ? "Editar viagem" : "Informar viagem"}</h2>
      <p class="muted" style="margin-top:0">
        O sistema <strong>já considera</strong> esses dias na geração da escala — você não será escalado nesse período.
      </p>
      <label class="field"><span>A partir de</span>
        <input type="date" id="v-inicio" value="${UI().esc(dataIni)}"/>
      </label>
      <label class="field"><span>Quantos dias estará fora?</span>
        <input type="number" id="v-qtd" class="input" min="1" max="365" value="${qtdAtual}"/>
      </label>
      <p class="muted" style="margin:-6px 0 12px;font-size:13px" id="v-fim-hint"></p>
      <label class="field"><span>Motivo</span>
        <div class="radio-list" style="margin-top:6px">
          <label><input type="radio" name="v-motivo" value="trabalho" ${motivo === "trabalho" ? "checked" : ""}/> Viagem a trabalho</label>
          <label><input type="radio" name="v-motivo" value="familiar" ${motivo === "familiar" ? "checked" : ""}/> Viagem familiar</label>
        </div>
      </label>
      <label class="field"><span>Observação (opcional)</span>
        <textarea id="v-obs" class="textarea" rows="2" placeholder="Ex.: congresso, férias com a família…">${UI().esc(obsLivre)}</textarea>
      </label>
      <div class="modal-actions">
        ${
          restricao
            ? `<button type="button" class="btn btn-danger" data-act="delete" style="margin-right:auto">Excluir viagem</button>`
            : ""
        }
        <button type="button" class="btn btn-ghost" data-act="cancel">Cancelar</button>
        <button type="button" class="btn btn-accent" data-act="save">Salvar</button>
      </div>
    `);

    const m = document.getElementById("modal-root");
    const syncFim = () => {
      const ini = m.querySelector("#v-inicio")?.value;
      const qtd = Math.max(1, Number(m.querySelector("#v-qtd")?.value) || 1);
      const hint = m.querySelector("#v-fim-hint");
      if (!hint || !ini) return;
      const fim = Cal().fimPorQtdDias(ini, qtd);
      hint.textContent =
        qtd === 1
          ? `Fora em ${Cal().formatBR(ini)} (${Cal().diaSemana(ini)}).`
          : `Fora de ${Cal().formatBR(ini)} a ${Cal().formatBR(fim)} (${qtd} dias).`;
    };
    m.querySelector("#v-inicio")?.addEventListener("change", syncFim);
    m.querySelector("#v-qtd")?.addEventListener("input", syncFim);
    syncFim();

    m.addEventListener("click", async (e) => {
      const act = e.target.closest("[data-act]")?.dataset.act;
      if (act === "cancel") return UI().closeModal();
      if (act === "delete" && restricao) {
        const ok = await UI().confirmDelete({
          itemLabel: `a viagem de <strong>${UI().esc(Cal().formatBR(restricao.data))}</strong>`,
          detalhes: "Esses dias voltam a ficar disponíveis na geração da escala.",
        });
        if (!ok) return;
        const resDel = window.DiaconiaRestrictions.excluir(state, restricao.id, window.DiaconiaAuth.sessao());
        if (!resDel.ok) return UI().toast(resDel.erro);
        UI().closeModal();
        app.save();
        app.render();
        UI().toast("Viagem removida.");
        return;
      }
      if (act !== "save") return;

      const inicio = m.querySelector("#v-inicio")?.value;
      const qtd = Math.max(1, Math.min(365, Number(m.querySelector("#v-qtd")?.value) || 1));
      const motivoSel = m.querySelector('input[name="v-motivo"]:checked')?.value || "trabalho";
      const obs = m.querySelector("#v-obs")?.value.trim() || "";
      if (!inicio) return UI().toast("Informe a data de início.");

      const sessao = window.DiaconiaAuth.sessao();
      let res;
      if (restricao) {
        const fim = Cal().fimPorQtdDias(inicio, qtd);
        const observacao = [
          `Viagem ${motivoSel === "trabalho" ? "a trabalho" : "familiar"} (${qtd} dia${qtd > 1 ? "s" : ""})`,
          obs,
        ]
          .filter(Boolean)
          .join(" — ");
        res = window.DiaconiaRestrictions.atualizar(
          state,
          restricao.id,
          {
            data: inicio,
            dataFim: fim === inicio ? null : fim,
            qtdDias: qtd,
            tipo: "indisponivel",
            motivoViagem: motivoSel,
            observacao,
          },
          sessao
        );
      } else {
        res = window.DiaconiaRestrictions.criarViagem(
          state,
          { data: inicio, qtdDias: qtd, motivoViagem: motivoSel, observacao: obs },
          sessao
        );
      }

      if (!res?.ok) return UI().toast(res?.erro || "Não foi possível salvar.");
      UI().closeModal();
      app.save();
      app.render();

      const afet = res.afetacoes?.length || res.restricao?.afetacoes?.length;
      if (afet) {
        UI().toast("Viagem salva. Você já estava em alguma escala — a liderança verá o alerta.");
      } else {
        UI().toast("Viagem salva. Esses dias não entram na geração da escala.");
      }
    });
  }

  /* ——— Avisos (restrições + trocas + notificações) ——— */
  function avisos(app) {
    const { state } = app;
    const did = diaconoId(app);
    const sessao = window.DiaconiaAuth.sessao();
    const uid = sessao?.usuarioId;

    const minhasRest = (state.restricoes || [])
      .filter((r) => r.diaconoId === did)
      .sort((a, b) => String(b.data).localeCompare(String(a.data)));

    const minhasTrocas = (state.trocas || [])
      .filter((t) => t.deDiaconoId === did || t.paraDiaconoId === did)
      .sort((a, b) => String(b.data).localeCompare(String(a.data)));

    const pendentes = minhasTrocas.filter(
      (t) => t.paraDiaconoId === did && t.status === "aguardando_aceite"
    );

    const listaNotif = (state.notificacoes || []).filter((n) => n.usuarioId === uid);
    const pendenteIds = new Set(pendentes.map((t) => t.id));

    const cardsPendentes = pendentes.map((t) => cardPedidoTroca(state, t)).join("");

    const notifItems = listaNotif
      .filter((n) => !(n.meta?.trocaId && pendenteIds.has(n.meta.trocaId)))
      .slice(0, 12)
      .map(
        (n) => `<div class="panel" style="padding:14px;opacity:${n.lida ? 0.7 : 1}">
        <strong>${UI().esc(n.titulo)}</strong>
        <p style="margin:6px 0 0">${UI().esc(n.corpo)}</p>
        <p class="muted" style="font-size:12px;margin:6px 0 0">${UI().esc(new Date(n.em).toLocaleString("pt-BR"))}</p>
      </div>`
      )
      .join("");

    listaNotif.forEach((n) => {
      n.lida = true;
    });
    app.save();

    const tipoRest = {
      indisponivel: "Não posso participar",
      funcao: "Não posso fazer uma função",
      horario: "Chego mais tarde",
      outro: "Outro",
    };

    const labelRest = (r) => {
      if (r.motivoViagem === "trabalho") return "Viagem a trabalho";
      if (r.motivoViagem === "familiar") return "Viagem familiar";
      return tipoRest[r.tipo] || r.tipo;
    };

    const periodoRest = (r) => {
      if (r.dataFim && r.dataFim !== r.data) {
        return `${Cal().formatBR(r.data)} a ${Cal().formatBR(r.dataFim)}`;
      }
      return Cal().formatBR(r.data);
    };

    const rowsRest = minhasRest
      .map(
        (r) => `<tr class="no-click">
        ${UI().bulkTd(r.id, "avisos-rest-diacono")}
        <td>${UI().esc(periodoRest(r))}</td>
        <td>${UI().esc(labelRest(r))}</td>
        <td>${UI().esc(r.observacao || "—")}</td>
        <td>${labelStatusRestricao(r.status)}</td>
        <td class="toolbar">${acoesRestricao(r)}</td>
      </tr>`
      )
      .join("");

    const rowsTroca = minhasTrocas
      .map((t) => {
        const tipo =
          t.modalidade === "cobertura"
            ? `<span class="badge badge-warn">Cobertura</span>`
            : `<span class="badge badge-ok">Troca</span>`;
        const seta = t.modalidade === "cobertura" ? "← cobre" : "↔";
        return `<tr class="no-click">
          ${UI().bulkTd(t.id, "avisos-troca-diacono")}
          <td>${UI().esc(Cal().formatBR(t.data))}</td>
          <td>${tipo}</td>
          <td>${UI().esc(UI().nomeDiacono(state, t.deDiaconoId))} ${seta} ${UI().esc(UI().nomeDiacono(state, t.paraDiaconoId))}</td>
          <td>${UI().esc(UI().nomeFuncoesTroca(state, t))}</td>
          <td>${UI().badgeTroca(t.status, { visaoDiacono: true })}${
            t.multifuncao && t.status === "aguardando_aceite"
              ? `<span class="muted" style="font-size:11px;display:block;margin-top:2px">Várias funções · aguardando confirmação</span>`
              : t.status === "rejeitada"
              ? `<span class="muted" style="font-size:11px;display:block;margin-top:2px">Sua escala não mudou</span>`
              : ""
          }</td>
          <td class="toolbar">${acoesTroca(t, did)}</td>
        </tr>`;
      })
      .join("");

    return `
      <div class="topbar">
        <div>
          <h1>Avisos</h1>
          <p class="sub">Não posso ir, pedidos de cobertura e mensagens da liderança.</p>
        </div>
        <div class="toolbar">
          <button class="btn btn-ghost" id="btn-nova-rest">Não posso ir</button>
          <button class="btn btn-accent" id="btn-nova-troca">Pedir cobertura</button>
        </div>
      </div>

      ${
        cardsPendentes
          ? `<div style="margin-bottom:16px">
              <h2 style="font-size:16px;margin:0 0 10px">Precisam da sua resposta</h2>
              <div class="grid">${cardsPendentes}</div>
            </div>`
          : ""
      }

      <div class="panel" style="margin-bottom:16px">
        <div class="panel-head"><h2>Quando não posso servir</h2></div>
        ${UI().bulkBar("avisos-rest-diacono")}
        <div class="table-wrap"><table class="data" data-bulk-table="avisos-rest-diacono">
          <thead><tr>${UI().bulkTh("avisos-rest-diacono")}<th>Data</th><th>Motivo</th><th>Obs.</th><th>Status</th><th></th></tr></thead>
          <tbody>${rowsRest || `<tr class="no-click"><td colspan="6" class="empty">Nenhum aviso enviado.</td></tr>`}</tbody>
        </table></div>
      </div>

      <div class="panel" style="margin-bottom:16px">
        <div class="panel-head"><h2>Coberturas e trocas</h2></div>
        <p class="muted" style="margin:0 0 10px;font-size:13px">
          <strong>Cobertura</strong> = alguém assume todas as suas funções naquele culto e você sai.
          <strong>Troca</strong> = vocês permutam funções.
        </p>
        ${UI().bulkBar("avisos-troca-diacono")}
        <div class="table-wrap"><table class="data" data-bulk-table="avisos-troca-diacono">
          <thead><tr>${UI().bulkTh("avisos-troca-diacono")}<th>Data</th><th>Tipo</th><th>Pessoas</th><th>Função</th><th>Status</th><th></th></tr></thead>
          <tbody>${rowsTroca || `<tr class="no-click"><td colspan="7" class="empty">Nenhum pedido.</td></tr>`}</tbody>
        </table></div>
      </div>

      <div class="panel">
        <div class="panel-head"><h2>Mensagens</h2></div>
        <div class="grid">${notifItems || `<div class="empty muted">Nenhuma mensagem.</div>`}</div>
      </div>`;
  }

  function bindAvisos(app, root) {
    const { state } = app;

    root.querySelector("#btn-nova-rest")?.addEventListener("click", () => escolherMotivoNaoPosso(app));
    root.querySelector("#btn-nova-troca")?.addEventListener("click", () => formTroca(app));

    if (app._abrirTroca) {
      app._abrirTroca = false;
      formTroca(app);
    }

    root.querySelectorAll('[data-act="edit-r"]').forEach((btn) => {
      btn.addEventListener("click", () => {
        const r = state.restricoes.find((x) => x.id === btn.dataset.id);
        if (r?.motivoViagem) formViagem(app, r);
        else formRestricao(app, r);
      });
    });

    root.querySelectorAll('[data-act="del-r"]').forEach((btn) => {
      btn.addEventListener("click", async () => {
        const r = state.restricoes.find((x) => x.id === btn.dataset.id);
        if (!r) return;
        const ok = await UI().confirmDelete({
          itemLabel: `seu aviso de <strong>${UI().esc(Cal().formatBR(r.data))}</strong>`,
        });
        if (!ok) return;
        const res = window.DiaconiaRestrictions.excluir(state, r.id, window.DiaconiaAuth.sessao());
        if (!res.ok) return UI().toast(res.erro);
        app.save();
        app.render();
        UI().toast("Aviso removido.");
      });
    });

    root.querySelectorAll('[data-act="aceitar"], [data-act="recusar"]').forEach((btn) => {
      btn.addEventListener("click", () => responderPedidoTroca(app, btn.dataset.id, btn.dataset.act === "aceitar"));
    });

    root.querySelectorAll('[data-act="aceitar-troca"], [data-act="recusar-troca"]').forEach((btn) => {
      btn.addEventListener("click", () =>
        responderPedidoTroca(app, btn.dataset.id, btn.dataset.act === "aceitar-troca")
      );
    });

    root.querySelectorAll('[data-act="edit-t"]').forEach((btn) => {
      btn.addEventListener("click", () => {
        formTroca(app, state.trocas.find((x) => x.id === btn.dataset.id));
      });
    });

    root.querySelectorAll('[data-act="del-t"]').forEach((btn) => {
      btn.addEventListener("click", async () => {
        const t = state.trocas.find((x) => x.id === btn.dataset.id);
        if (!t) return;
        const ok = await UI().confirmDelete({
          itemLabel: `o pedido em <strong>${UI().esc(Cal().formatBR(t.data))}</strong>`,
        });
        if (!ok) return;
        const res = window.DiaconiaSwaps.excluir(state, t.id, window.DiaconiaAuth.sessao());
        if (!res.ok) return UI().toast(res.erro);
        app.save();
        app.render();
        UI().toast("Pedido excluído.");
      });
    });

    const sessao = window.DiaconiaAuth.sessao();
    UI().bindBulkTable(root, "avisos-rest-diacono", {
      itemLabel: "aviso(s)",
      onDelete: async (ids) => {
        let n = 0;
        for (const id of ids) {
          const res = window.DiaconiaRestrictions.excluir(state, id, sessao);
          if (res?.ok) n += 1;
        }
        app.save();
        app.render();
        UI().toast(n ? `${n} aviso(s) excluído(s).` : "Nenhum aviso pôde ser excluído.");
      },
    });

    UI().bindBulkTable(root, "avisos-troca-diacono", {
      itemLabel: "pedido(s)",
      onDelete: async (ids) => {
        let n = 0;
        for (const id of ids) {
          const res = window.DiaconiaSwaps.excluir(state, id, sessao);
          if (res.ok) n += 1;
        }
        app.save();
        app.render();
        UI().toast(n ? `${n} pedido(s) excluído(s).` : "Nenhum pedido pôde ser excluído.");
      },
    });
  }

  /**
   * Escolha inicial de "Não posso ir":
   * emergência | outro ministério | pedir cobertura
   */
  function escolherMotivoNaoPosso(app, opts = {}) {
    const dataHint = opts.data
      ? `<p class="muted" style="margin:0 0 12px">Referente a <strong>${UI().esc(Cal().formatBR(opts.data))}</strong></p>`
      : "";

    UI().openModal(`
      <h2>Não posso ir</h2>
      ${dataHint}
      <p class="muted" style="margin-top:0">O que aconteceu?</p>
      <div class="choice-stack">
        <button type="button" class="btn btn-choice" data-act="emergencia">
          <strong>Tive uma emergência</strong>
          <span>Avisar a liderança com urgência</span>
        </button>
        <button type="button" class="btn btn-choice" data-act="ministerio">
          <strong>Estou em outro ministério</strong>
          <span>Já tenho escala em outro lugar neste dia</span>
        </button>
        <button type="button" class="btn btn-choice" data-act="cobertura">
          <strong>Pedir cobertura</strong>
          <span>Alguém assume no meu lugar</span>
        </button>
      </div>
      <div class="modal-actions">
        <button class="btn btn-ghost" data-act="cancel">Cancelar</button>
      </div>
    `);

    const m = document.getElementById("modal-root");
    m.addEventListener("click", (e) => {
      const act = e.target.closest("[data-act]")?.dataset.act;
      if (!act) return;
      e.stopPropagation();
      if (act === "cancel") return UI().closeModal();
      if (act === "emergencia") {
        UI().closeModal();
        setTimeout(
          () =>
            formRestricaoRapida(app, {
              data: opts.data,
              motivo: "emergencia",
              titulo: "Tive uma emergência",
              obsPadrao: "Emergência",
            }),
          0
        );
        return;
      }
      if (act === "ministerio") {
        UI().closeModal();
        setTimeout(
          () =>
            formRestricaoRapida(app, {
              data: opts.data,
              motivo: "ministerio",
              titulo: "Estou em outro ministério",
              obsPadrao: "Escalado em outro ministério",
            }),
          0
        );
        return;
      }
      if (act === "cobertura") {
        UI().closeModal();
        setTimeout(() => formTroca(app, null, { data: opts.data }), 0);
      }
    });
  }

  function enviarAvisoRapido(app, { dataSel, motivo, obsPadrao, obsRaw }) {
    const { state } = app;
    let obs = (obsRaw || "").trim();
    if (!obs) obs = obsPadrao || "";
    if (motivo === "emergencia" && !/emergência/i.test(obs)) {
      obs = obs ? `Emergência — ${obs}` : "Emergência";
    }
    if (motivo === "ministerio" && !/ministério/i.test(obs)) {
      obs = obs ? `Outro ministério — ${obs}` : "Escalado em outro ministério";
    }
    return window.DiaconiaRestrictions.criar(
      state,
      {
        data: dataSel,
        tipo: "indisponivel",
        funcaoId: null,
        horarioChegada: null,
        observacao: obs,
        status: "pendente",
      },
      window.DiaconiaAuth.sessao()
    );
  }

  function oferecerCoberturaAposAviso(app, dataSel, { motivo, irDireto = false } = {}) {
    const { state } = app;
    const did = diaconoId(app);
    const naEscala = Engine().diaconoEstaEscaladoNaData(state, did, dataSel);

    if (!naEscala) {
      UI().toast("Aviso enviado — aguardando o líder.");
      app.page = "avisos";
      app.render();
      return;
    }

    if (motivo === "ministerio" || irDireto) {
      UI().toast("Aviso enviado.");
      formTroca(app, null, { data: dataSel });
      return;
    }

    UI().openModal(`
      <h2>Aviso enviado</h2>
      <p>A liderança foi notificada.</p>
      <p>Você está escalado em <strong>${UI().esc(Cal().formatBR(dataSel))}</strong>. A escala <strong>não muda sozinha</strong> — se precisar de alguém no seu lugar, peça cobertura.</p>
      <div class="modal-actions">
        <button class="btn btn-ghost" data-act="ok">Estou ciente, mas não consigo agora</button>
        <button class="btn btn-accent" data-act="cobertura">Pedir cobertura</button>
      </div>
    `);
    const a = document.getElementById("modal-root");
    a.addEventListener("click", (ev) => {
      const x = ev.target.closest("[data-act]")?.dataset.act;
      if (x === "ok") {
        UI().closeModal();
        app.page = "avisos";
        app.render();
      }
      if (x === "cobertura") {
        UI().closeModal();
        formTroca(app, null, { data: dataSel });
      }
    });
  }

  /** Formulário curto: data + observação, sempre tipo indisponível */
  function formRestricaoRapida(app, { data, motivo, titulo, obsPadrao }) {
    const { state } = app;
    const did = diaconoId(app);
    const dataRef = data || "";
    const naEscala = dataRef && Engine().diaconoEstaEscaladoNaData(state, did, dataRef);
    const ehMinisterio = motivo === "ministerio";

    const acoesHtml = ehMinisterio
      ? `<button class="btn btn-ghost" data-act="send-only">Só avisar a liderança</button>
         <button class="btn btn-accent" data-act="send-cobertura">Continuar e pedir cobertura</button>`
      : `<button class="btn btn-accent" data-act="send">Enviar aviso</button>`;

    const dicaHtml = ehMinisterio
      ? naEscala
        ? `<p class="muted" style="margin-top:0">Informe o dia. Depois você pode pedir cobertura na diaconia.</p>`
        : `<p class="muted" style="margin-top:0">Informe o dia. A liderança será avisada.</p>`
      : `<p class="muted" style="margin-top:0">Informe o dia. A liderança será avisada.</p>`;

    UI().openModal(`
      <h2>${UI().esc(titulo)}</h2>
      ${dicaHtml}
      <label class="field"><span>Data</span><input type="date" id="r-data" value="${UI().esc(dataRef)}" required/></label>
      <label class="field"><span>Detalhe (opcional)</span>
        <textarea id="r-obs" class="textarea" rows="3" placeholder="Algo a mais para a liderança saber…">${UI().esc(obsPadrao || "")}</textarea>
      </label>
      <div class="modal-actions">
        <button class="btn btn-ghost" data-act="voltar">Voltar</button>
        ${acoesHtml}
      </div>
    `);

    const m = document.getElementById("modal-root");
    m.addEventListener("click", (e) => {
      const act = e.target.closest("[data-act]")?.dataset.act;
      if (act === "voltar") {
        UI().closeModal();
        escolherMotivoNaoPosso(app, { data });
        return;
      }
      const enviar =
        act === "send" || act === "send-only" || act === "send-cobertura";
      if (!enviar) return;

      const dataSel = m.querySelector("#r-data").value;
      if (!dataSel) return UI().toast("Informe a data.");
      const obsRaw = m.querySelector("#r-obs").value;

      const res = enviarAvisoRapido(app, { dataSel, motivo, obsPadrao, obsRaw });
      if (res.ok === false) return UI().toast(res.erro);
      app.save();
      UI().closeModal();

      const querCobertura = act === "send-cobertura";
      if (querCobertura) {
        oferecerCoberturaAposAviso(app, dataSel, { motivo, irDireto: true });
        return;
      }

      if (act === "send-only") {
        UI().toast("Aviso enviado — aguardando o líder.");
        app.page = "avisos";
        app.render();
        return;
      }

      if (res.alertaEscalaExistente || Engine().diaconoEstaEscaladoNaData(state, did, dataSel)) {
        oferecerCoberturaAposAviso(app, dataSel, { motivo });
      } else {
        UI().toast("Aviso enviado — aguardando o líder.");
        app.page = "avisos";
        app.render();
      }
    });
  }

  function formRestricao(app, restricao = null, opts = {}) {
    const { state } = app;
    const tipo = restricao?.tipo || "indisponivel";
    const dataPadrao = restricao?.data || opts.data || "";
    const avancado = tipo !== "indisponivel";
    const funOpts = state.funcoes
      .map(
        (f) =>
          `<option value="${f.id}" ${restricao?.funcaoId === f.id ? "selected" : ""}>${UI().esc(f.emoji + " " + f.nome)}</option>`
      )
      .join("");

    UI().openModal(`
      <h2>${restricao ? "Editar aviso" : "Não posso ir"}</h2>
      <p class="muted" style="margin-top:0">A liderança será avisada. Se a escala já existir, fale com um líder se precisar de cobertura urgente.</p>
      <label class="field"><span>Data</span><input type="date" id="r-data" value="${UI().esc(dataPadrao)}"/></label>
      <label class="field"><span>Observação (opcional)</span>
        <textarea id="r-obs" class="textarea" rows="3" placeholder="Ex.: Escala em outro ministério, viagem, compromisso…">${UI().esc(restricao?.observacao || "")}</textarea>
      </label>
      <details class="adv-details" ${avancado ? "open" : ""}>
        <summary>Opções avançadas</summary>
        <p style="margin:10px 0 6px"><strong>Tipo</strong></p>
        <div class="radio-list">
          <label><input type="radio" name="rtype" value="indisponivel" ${tipo === "indisponivel" ? "checked" : ""}/> Não posso participar neste dia</label>
          <label><input type="radio" name="rtype" value="funcao" ${tipo === "funcao" ? "checked" : ""}/> Não posso fazer determinada função</label>
          <label><input type="radio" name="rtype" value="horario" ${tipo === "horario" ? "checked" : ""}/> Consigo chegar só a partir de certo horário</label>
          <label><input type="radio" name="rtype" value="outro" ${tipo === "outro" ? "checked" : ""}/> Outro</label>
        </div>
        <label class="field" id="wrap-fn"><span>Função</span><select id="r-fn" class="select">${funOpts}</select></label>
        <label class="field" id="wrap-hora"><span>Consigo chegar a partir de</span><input id="r-hora" value="${UI().esc(restricao?.horarioChegada || "18:30")}"/></label>
      </details>
      ${
        restricao?.status && restricao.status !== "pendente"
          ? `<div class="alert alert-warn">Ao salvar, o aviso volta a aguardar aprovação da liderança.</div>`
          : ""
      }
      <div class="modal-actions">
        ${restricao ? `<button class="btn btn-danger" data-act="delete" style="margin-right:auto">Excluir</button>` : ""}
        <button class="btn btn-ghost" data-act="cancel">Cancelar</button>
        <button class="btn btn-accent" data-act="send">${restricao ? "Salvar" : "Enviar aviso"}</button>
      </div>
    `);

    const m = document.getElementById("modal-root");
    const sync = () => {
      const t = m.querySelector('input[name="rtype"]:checked')?.value || "indisponivel";
      m.querySelector("#wrap-fn").style.display = t === "funcao" ? "" : "none";
      m.querySelector("#wrap-hora").style.display = t === "horario" ? "" : "none";
    };
    m.querySelectorAll('input[name="rtype"]').forEach((r) => r.addEventListener("change", sync));
    sync();

    m.addEventListener("click", async (e) => {
      const act = e.target.closest("[data-act]")?.dataset.act;
      if (act === "cancel") return UI().closeModal();

      if (act === "delete" && restricao) {
        UI().closeModal();
        const ok = await UI().confirmDelete({
          itemLabel: `seu aviso de <strong>${UI().esc(Cal().formatBR(restricao.data))}</strong>`,
        });
        if (!ok) return;
        const resDel = window.DiaconiaRestrictions.excluir(state, restricao.id, window.DiaconiaAuth.sessao());
        if (!resDel.ok) return UI().toast(resDel.erro);
        app.save();
        app.render();
        UI().toast("Aviso removido.");
        return;
      }

      if (act !== "send") return;
      const tipoSel = m.querySelector('input[name="rtype"]:checked')?.value || "indisponivel";
      const data = m.querySelector("#r-data").value;
      if (!data) return UI().toast("Informe a data.");

      const payload = {
        data,
        tipo: tipoSel,
        funcaoId: tipoSel === "funcao" ? m.querySelector("#r-fn").value : null,
        horarioChegada: tipoSel === "horario" ? m.querySelector("#r-hora").value : null,
        observacao: m.querySelector("#r-obs").value.trim(),
        status: "pendente",
      };

      let res;
      if (restricao) {
        res = window.DiaconiaRestrictions.atualizar(
          state,
          restricao.id,
          payload,
          window.DiaconiaAuth.sessao()
        );
      } else {
        res = window.DiaconiaRestrictions.criar(state, payload, window.DiaconiaAuth.sessao());
      }

      if (res.ok === false) return UI().toast(res.erro);
      app.save();
      UI().closeModal();

      if (!restricao && res.alertaEscalaExistente) {
        UI().openModal(`
          <h2>Aviso enviado</h2>
          <p>A liderança foi notificada.</p>
          <p>A escala já montada <strong>não muda sozinha</strong> — se precisar de cobertura urgente, fale com um líder.</p>
          <div class="modal-actions">
            <button class="btn btn-ghost" data-act="ok">Estou ciente, mas não consigo agora</button>
            <button class="btn btn-accent" data-act="falar">Falar com um líder</button>
          </div>
        `);
        const a = document.getElementById("modal-root");
        a.addEventListener("click", (ev) => {
          const x = ev.target.closest("[data-act]")?.dataset.act;
          if (x === "ok") {
            UI().closeModal();
            app.page = "avisos";
            app.render();
          }
          if (x === "falar") {
            UI().closeModal();
            app.page = "conta";
            app.render();
            setTimeout(() => document.getElementById("sec-lideres")?.scrollIntoView({ behavior: "smooth" }), 50);
          }
        });
      } else {
        UI().toast(restricao ? "Aviso atualizado." : "Aviso enviado — aguardando o líder.");
        app.page = "avisos";
        app.render();
      }
    });
  }

  async function responderPedidoTroca(app, trocaId, aceitar) {
    const { state } = app;
    const t = (state.trocas || []).find((x) => x.id === trocaId);
    if (!t) return;
    if (aceitar && t.modalidade === "cobertura") {
      const ok = await UI().confirmarCoberturaTodasFuncoes({
        nomesFuncoes: UI().listaFuncoesTroca(state, t),
        dataBr: Cal().formatBR(t.data),
        nomeQuemSai: UI().nomeDiacono(state, t.deDiaconoId),
        nomeQuemCobre: UI().nomeDiacono(state, t.paraDiaconoId),
        visao: "aceite",
      });
      if (!ok) return;
    }
    if (aceitar && t.modalidade !== "cobertura" && t.multifuncao) {
      const resumo = window.DiaconiaSwaps.resumoTrocaMultifuncao(state, t);
      const ok = await UI().confirmarTrocaTodasFuncoes({
        nomesOrigem: resumo.nomesOrigem,
        nomesAlvo: resumo.nomesAlvo,
        dataBr: Cal().formatBR(t.data),
        nomeQuemSai: resumo.nomeDe,
        nomeQuemEntra: "Você",
        visao: "aceite",
      });
      if (!ok) return;
    }
    const res = aceitar
      ? window.DiaconiaSwaps.aceitar(state, trocaId, window.DiaconiaAuth.sessao())
      : window.DiaconiaSwaps.recusar(state, trocaId, window.DiaconiaAuth.sessao());
    if (!res.ok) return UI().toast(res.erro);
    app.save();
    app.render();
    UI().toast(aceitar ? "Aceito — escala atualizada." : "Pedido recusado.");
  }

  function acoesTroca(t, did) {
    const btns = [];
    if (t.status === "aguardando_aceite" && t.paraDiaconoId === did) {
      btns.push(
        UI().btnIcon({ icon: "check", label: "Aceitar", variant: "primary", attrs: { "data-act": "aceitar", "data-id": t.id } })
      );
      btns.push(
        UI().btnIcon({ icon: "x", label: "Recusar", variant: "danger", attrs: { "data-act": "recusar", "data-id": t.id } })
      );
    }
    if (t.deDiaconoId === did && t.status === "aguardando_aceite") {
      btns.push(
        UI().btnIcon({ icon: "pencil", label: "Editar", variant: "ghost", attrs: { "data-act": "edit-t", "data-id": t.id } })
      );
    }
    if (t.deDiaconoId === did && t.status !== "aprovada") {
      btns.push(
        UI().btnIcon({ icon: "trash", label: "Excluir", variant: "danger", attrs: { "data-act": "del-t", "data-id": t.id } })
      );
    }
    if (t.deDiaconoId === did && t.status === "rejeitada") {
      return btns.length
        ? btns.join("")
        : `<span class="muted" style="font-size:12px">Escala mantida</span>`;
    }
    return btns.length ? btns.join("") : "—";
  }

  function formTroca(app, troca = null, pref = {}) {
    const { state, ano, mes } = app;
    const did = diaconoId(app);
    let parts = Engine().participacoesDoDiacono(state, did, ano, mes);

    if (pref.data) {
      for (const p of Engine().participacoesNaData(state, did, pref.data)) {
        const chave = `${p.data}|${p.equipeId}|${p.funcaoId}`;
        if (!parts.some((x) => `${x.data}|${x.equipeId}|${x.funcaoId}` === chave)) {
          parts.push(p);
        }
      }
      parts.sort((a, b) => a.data.localeCompare(b.data));
    }

    if (troca) {
      const chave = `${troca.data}|${troca.equipeId}|${troca.funcaoId}`;
      const tem = parts.some((p) => `${p.data}|${p.equipeId}|${p.funcaoId}` === chave);
      if (!tem) {
        parts = [
          { data: troca.data, equipeId: troca.equipeId, funcaoId: troca.funcaoId },
          ...parts,
        ];
      }
    }

    if (!parts.length) {
      UI().toast("Você não tem escalas neste mês para pedir cobertura.");
      return;
    }

    const paraSel = pref.paraDiaconoId || troca?.paraDiaconoId;
    const mod = pref.modalidade === "troca" || troca?.modalidade === "troca" ? "troca" : "cobertura";

    let valorAtual =
      pref.data && pref.equipeId && pref.funcaoId
        ? `${pref.data}|${pref.equipeId}|${pref.funcaoId}`
        : troca
          ? `${troca.data}|${troca.equipeId}|${troca.funcaoId}`
          : null;
    if (!valorAtual && pref.data) {
      const match = parts.find((p) => p.data === pref.data);
      if (match) valorAtual = `${match.data}|${match.equipeId}|${match.funcaoId}`;
    }

    const partesDoDia = (data) => parts.filter((p) => p.data === data);

    const optsPara = (modalidade, selecionado) => {
      const lista = parts.filter((p, i, arr) => arr.findIndex((x) => x.data === p.data) === i);
      return lista
        .map((p) => {
          const doDia = partesDoDia(p.data);
          const val = `${p.data}|${p.equipeId}|${p.funcaoId}`;
          const selData = (selecionado || "").split("|")[0];
          const selected = p.data === selData || val === selecionado;
          let label = `${Cal().formatBR(p.data)} — ${Engine().getFuncao(state, p.funcaoId)?.nome || p.funcaoId}`;
          if (doDia.length > 1) {
            const nomes = doDia
              .map((x) => Engine().getFuncao(state, x.funcaoId)?.nome || x.funcaoId)
              .join(", ");
            label = `${Cal().formatBR(p.data)} — ${doDia.length} funções (${nomes})`;
          }
          return `<option value="${val}" ${selected ? "selected" : ""}>${UI().esc(label)}</option>`;
        })
        .join("");
    };

    const outros = state.diaconos
      .filter((d) => d.id !== did && d.ativo !== false)
      .map((d) => {
        const eqPub = UI().nomeEquipePublico(state, d.equipeId);
        const wa = d.whatsapp ? "" : " · sem WhatsApp";
        const eqLabel = eqPub ? ` (${UI().esc(eqPub)})` : "";
        return `<option value="${d.id}" ${paraSel === d.id ? "selected" : ""}>${UI().esc(d.nome)}${eqLabel}${UI().esc(wa)}</option>`;
      })
      .join("");

    UI().openModal(`
      <h2>${troca ? "Editar pedido" : "Pedir cobertura"}</h2>
      <p class="muted" style="margin-top:0">Ao enviar, o WhatsApp da pessoa abre com o pedido e o link do portal para ela entrar e aceitar.</p>
      <p><strong>O que você precisa?</strong></p>
      <div class="radio-list">
        <label><input type="radio" name="t-mod" value="cobertura" ${mod === "cobertura" ? "checked" : ""}/>
          <strong>Alguém me cobre</strong> — a pessoa assume todas as suas funções deste culto e você sai</label>
        <label><input type="radio" name="t-mod" value="troca" ${mod === "troca" ? "checked" : ""}/>
          <strong>Trocar de função</strong> — permutamos no mesmo culto (se alguém tiver várias funções, permutam todas)</label>
      </div>
      <label class="field"><span id="t-label-part">Em qual culto</span><select id="t-part" class="select">${optsPara(mod, valorAtual)}</select></label>
      <div id="t-aviso-multi"></div>
      <label class="field"><span>Com quem</span><select id="t-com" class="select">${outros}</select></label>
      <div class="modal-actions">
        <button class="btn btn-ghost" data-act="cancel">Cancelar</button>
        <button class="btn btn-accent" data-act="send">${troca ? "Salvar" : "Enviar pedido"}</button>
      </div>
    `);
    const m = document.getElementById("modal-root");

    const modalidadeAtual = () => m.querySelector('input[name="t-mod"]:checked')?.value || "cobertura";

    const atualizarAviso = () => {
      const wrap = m.querySelector("#t-aviso-multi");
      const label = m.querySelector("#t-label-part");
      const partVal = m.querySelector("#t-part").value;
      const data = partVal?.split("|")[0];
      const doDia = partesDoDia(data);
      const cobertura = modalidadeAtual() === "cobertura";
      const paraId = m.querySelector("#t-com")?.value;
      const partesB = paraId ? Engine().participacoesNaData(state, paraId, data) : [];
      if (label) label.textContent = cobertura ? "Em qual culto" : "Em qual culto";
      if (!wrap) return;
      if (cobertura && doDia.length > 1) {
        const nomes = doDia.map((p) => UI().esc(UI().nomeFuncao(state, p.funcaoId))).join(", ");
        wrap.innerHTML = `<div class="alert alert-warn">Neste culto você está em <strong>${doDia.length} funções</strong> (${nomes}). Quem cobrir assume todas e você fica fora deste dia.</div>`;
      } else if (!cobertura && (doDia.length > 1 || partesB.length > 1)) {
        const nomesA = doDia.map((p) => UI().esc(UI().nomeFuncao(state, p.funcaoId))).join(", ") || "—";
        const nomeB = UI().esc(UI().nomeDiacono(state, paraId) || "a outra pessoa");
        const nomesB = partesB.length
          ? partesB.map((p) => UI().esc(UI().nomeFuncao(state, p.funcaoId))).join(", ")
          : "livre neste dia";
        wrap.innerHTML = `<div class="alert alert-warn">Há várias funções neste culto. A troca permutará <strong>todas</strong>:<br>
          Você: ${nomesA}<br>
          ${nomeB}: ${nomesB}</div>`;
      } else {
        wrap.innerHTML = "";
      }
    };

    m.querySelectorAll('input[name="t-mod"]').forEach((r) => {
      r.addEventListener("change", () => {
        const sel = m.querySelector("#t-part");
        sel.innerHTML = optsPara(modalidadeAtual(), sel.value);
        atualizarAviso();
      });
    });
    m.querySelector("#t-part").addEventListener("change", atualizarAviso);
    m.querySelector("#t-com")?.addEventListener("change", atualizarAviso);
    atualizarAviso();

    m.addEventListener("click", async (e) => {
      const act = e.target.closest("[data-act]")?.dataset.act;
      if (act === "cancel") return UI().closeModal();
      if (act !== "send") return;
      const [data, equipeId, funcaoId] = m.querySelector("#t-part").value.split("|");
      const modalidade = modalidadeAtual();
      const paraDiaconoId = m.querySelector("#t-com").value;
      const payload = { data, equipeId, funcaoId, paraDiaconoId, modalidade };

      if (modalidade === "cobertura") {
        const doDia = Engine().participacoesNaData(state, did, data);
        const nomesFuncoes = doDia.map((p) => UI().nomeFuncao(state, p.funcaoId));
        const ok = await UI().confirmarCoberturaTodasFuncoes({
          nomesFuncoes,
          dataBr: Cal().formatBR(data),
          nomeQuemSai: "",
          nomeQuemCobre: UI().nomeDiacono(state, paraDiaconoId),
          visao: "pedido",
        });
        if (!ok) {
          formTroca(app, troca, { ...payload });
          return;
        }
      } else if (modalidade === "troca") {
        const doDia = Engine().participacoesNaData(state, did, data);
        const doDiaB = Engine().participacoesNaData(state, paraDiaconoId, data);
        const ok = await UI().confirmarTrocaTodasFuncoes({
          nomesOrigem: doDia.map((p) => UI().nomeFuncao(state, p.funcaoId)),
          nomesAlvo: doDiaB.map((p) => UI().nomeFuncao(state, p.funcaoId)),
          dataBr: Cal().formatBR(data),
          nomeQuemSai: "Você",
          nomeQuemEntra: UI().nomeDiacono(state, paraDiaconoId),
          visao: "pedido",
        });
        if (!ok) {
          formTroca(app, troca, { ...payload });
          return;
        }
      }

      const res = troca
        ? window.DiaconiaSwaps.atualizar(state, troca.id, payload, window.DiaconiaAuth.sessao())
        : window.DiaconiaSwaps.solicitar(state, payload, window.DiaconiaAuth.sessao());
      if (!res.ok) return UI().toast(res.erro);
      app.save();
      UI().closeModal();

      if (!troca && res.troca) {
        const wa = res.whatsapp;
        if (wa?.ok) {
          if (wa.via === "api") {
            UI().toast(
              wa.pendenteApi
                ? `Pedido criado. WhatsApp enfileirado (API ainda não configurada).`
                : `Pedido criado. WhatsApp enviado para ${wa.nome || "o destinatário"}.`
            );
          } else {
            UI().toast(`Pedido criado. Mensagem copiada — escolha no painel: app instalado ou WhatsApp Web.`);
          }
        } else if (wa && !wa.ignorado) {
          UI().toast(`Pedido criado no portal. ${wa.erro || "WhatsApp não enviado."}`);
        } else if (res.troca?.multifuncao) {
          UI().toast("Pedido enviado. A escala só muda quando a outra pessoa confirmar a troca.");
        } else {
          UI().toast("Pedido enviado — a escala já mostra os nomes atualizados.");
        }
      } else {
        UI().toast(troca ? "Pedido atualizado." : "Pedido enviado.");
      }

      app.page = "avisos";
      app.render();
    });
  }

  function cardPedidoTroca(state, t) {
    const cobertura = t.modalidade === "cobertura";
    const tipo = cobertura ? "Pedido de cobertura" : "Pedido de troca";
    const de = UI().nomeDiacono(state, t.deDiaconoId);
    const fn = UI().nomeFuncoesTroca(state, t);
    const eq = UI().nomeEquipePublico(state, t.equipeId);
    const varias = (t.slotsCobertura || []).length > 1;
    const variasTroca = t.modalidade !== "cobertura" && t.multifuncao;
    const corpo = cobertura
      ? `${de} pediu para você cobrir <strong>${UI().esc(fn)}</strong> em ${UI().esc(Cal().formatBR(t.data))}${eq ? ` (${UI().esc(eq)})` : ""}.${varias ? " São todas as funções dela neste culto." : ""}`
      : `${de} pediu troca de <strong>${UI().esc(fn)}</strong> em ${UI().esc(Cal().formatBR(t.data))}${eq ? ` (${UI().esc(eq)})` : ""}.`;
    const alertaMulti = variasTroca
      ? `<div class="alert alert-warn" style="margin:10px 0 0">Há várias funções neste culto. Se você aceitar, permutam <strong>todas</strong>. A escala ainda não mudou.</div>`
      : "";

    return `<div class="panel notif-action" style="padding:14px">
      <div class="toolbar" style="justify-content:space-between;margin-bottom:6px">
        <strong>${UI().esc(tipo)}</strong>
        <span class="badge badge-warn">Aguardando você</span>
      </div>
      <p style="margin:0">${corpo}</p>
      ${alertaMulti}
      <div class="toolbar" style="margin-top:12px">
        <button class="btn btn-primary btn-sm" data-act="aceitar-troca" data-id="${t.id}">Aceitar</button>
        <button class="btn btn-danger btn-sm" data-act="recusar-troca" data-id="${t.id}">Recusar</button>
      </div>
    </div>`;
  }

  /* ——— Conta (perfil editável + líderes) ——— */
  function conta(app) {
    const { state } = app;
    const s = window.DiaconiaAuth.sessao();
    const d = state.diaconos.find((x) => x.id === s.diaconoId);
    const u = state.usuarios.find((x) => x.id === s.usuarioId);
    const casal = Engine().infoCasal(state, s.diaconoId);
    const parceiro = casal ? UI().nomeDiacono(state, casal.parceiroId) : null;
    const pref = casal?.casal
      ? casal.casal.naoServirJuntos
        ? "Não servem juntos na diaconia (apenas um por culto)"
        : casal.casal.preferirMesmaFuncao
          ? "Mesmo culto e, quando possível, mesma função"
          : casal.casal.preferirMesmoDia
            ? "Preferência: mesmo culto (funções podem ser diferentes)"
            : "Sem preferência de mesmo dia"
      : null;

    const lideresLista = (state.lideres || []).filter((l) => l.ativo !== false);
    const lideres = lideresLista
      .map((l) => {
        const url = UI().whatsappUrl(
          l.whatsapp,
          `Olá ${l.nome}, sou ${s?.nome} (diaconia) e preciso conversar sobre a escala.`
        );
        const semWa = !window.DiaconiaWhatsApp?.numeroValido?.(l.whatsapp);
        return `<div class="leader-item">
          <div><strong>${UI().esc(l.nome)}</strong>${semWa ? `<div class="muted" style="font-size:12px">WhatsApp não informado</div>` : ""}</div>
          ${
            semWa
              ? `<span class="btn btn-ghost btn-sm" style="opacity:.5;pointer-events:none">WhatsApp</span>`
              : `<a class="btn btn-accent btn-sm" href="${url}" target="_blank" rel="noopener">WhatsApp</a>`
          }
        </div>`;
      })
      .join("");

    return `
      <div class="topbar">
        <div>
          <h1>Minha conta</h1>
          <p class="sub">Atualize seus dados. O que você salvar aparece também para a liderança.</p>
        </div>
      </div>
      <div class="grid grid-2">
        <div class="panel">
          ${UI().previewDadosPessoaisHtml(d, { state })}
          <hr style="border:none;border-top:1px solid var(--line);margin:16px 0"/>
          <h2 style="margin-top:0">Atualizar dados</h2>
          ${UI().dadosPessoaisFormHtml("p", d, {
            labelCasado: "Sou casado(a)",
            labelFilhos: "Tenho filhos",
            labelConjuge: "Casado(a) com",
            ministerios: state.ministerios || [],
          })}
          <p class="muted" style="font-size:12px;margin:-6px 0 12px">A preferência de escala em casal continua sendo definida pela liderança.</p>
          <p class="muted" style="font-size:12px;margin:-6px 0 12px">Para um dia específico em que não pode ir, use Avisos → Não posso ir.</p>
          ${
            UI().nomeEquipePublico(state, d?.equipeId)
              ? `<p style="margin:14px 0 6px"><strong>Equipe:</strong> ${UI().esc(UI().nomeEquipePublico(state, d.equipeId))}</p>`
              : ""
          }
          ${
            parceiro
              ? `<p class="muted" style="font-size:13px">Na escala (liderança): casal com ${UI().esc(parceiro)} — ${UI().esc(pref)}</p>`
              : ""
          }
          <hr style="border:none;border-top:1px solid var(--line);margin:16px 0"/>
          <p><strong>Login:</strong> <code>${UI().esc(u?.login || "")}</code>
            <span class="muted" style="font-size:12px"> — não altera</span></p>
          <label class="field"><span>Nova senha</span>
            ${UI().passwordFieldHtml({ id: "p-senha", className: "input", placeholder: "Deixe em branco para manter" })}
          </label>
          <button class="btn btn-accent" id="btn-save-perfil">Salvar meus dados</button>
        </div>
        <div class="panel" id="sec-lideres">
          <h2>Falar com um líder</h2>
          <p class="muted" style="margin-top:0">${lideresLista.length ? `${lideresLista.length} líder(es) disponível(is).` : "Nenhum líder cadastrado no momento."} Tire dúvidas ou peça ajuda sobre a escala.</p>
          <div class="leader-list">${lideres || `<p class="muted">Nenhum líder cadastrado.</p>`}</div>
        </div>
      </div>`;
  }

  function bindConta(app, root) {
    UI().bindDadosPessoaisForm(root, "p");
    UI().bindPasswordToggles(root);

    root.querySelector("#btn-save-perfil")?.addEventListener("click", async () => {
      const { state } = app;
      const sessao = window.DiaconiaAuth.sessao();
      const d = state.diaconos.find((x) => x.id === sessao?.diaconoId);
      const u = state.usuarios.find((x) => x.id === sessao?.usuarioId);
      if (!d) return UI().toast("Cadastro de diácono não encontrado.");

      const dados = UI().lerDadosPessoaisForm(root, "p");
      const err = UI().validarDadosPessoaisForm(dados, { validarWhatsapp: true });
      if (err) return UI().toast(err);
      const senha = root.querySelector("#p-senha")?.value || "";

      UI().aplicarDadosPessoais(d, dados);

      if (u) {
        u.nome = dados.nome;
        u.whatsapp = window.DiaconiaWhatsApp?.normalizarNumeroInternacional
          ? window.DiaconiaWhatsApp.normalizarNumeroInternacional(dados.whatsapp)
          : String(dados.whatsapp || "").replace(/\D/g, "");
        if (senha) {
          u.senha = senha;
          window.DiaconiaStorage.touchUsuario?.(u);
        }
      }

      if (typeof window.DiaconiaAuth.atualizarSessao === "function") {
        window.DiaconiaAuth.atualizarSessao({ nome: dados.nome });
      } else if (sessao) {
        sessao.nome = dados.nome;
      }

      window.DiaconiaHistory?.add?.(state, {
        tipo: "perfil",
        mensagem: `${dados.nome} atualizou os dados pessoais.`,
        usuarioId: sessao?.usuarioId,
        meta: { diaconoId: d.id },
      });

      const sync = await app.saveAndSync();
      app.render();
      if (senha && sync?.ok) {
        UI().toast("Dados e senha salvos no servidor.");
      } else if (senha && !sync?.ok) {
        UI().toast("Salvo neste aparelho — senha ainda não confirmou no servidor.");
      } else {
        UI().toast("Dados salvos.");
      }
    });
  }

  /* ——— Ocorrências (durante o culto) ——— */
  function ocorrencias(app) {
    const { state } = app;
    const sessao = window.DiaconiaAuth.sessao();
    const Ocr = window.DiaconiaOcorrencias;
    Ocr?.ensure?.(state);
    const isLider = sessao?.papel === "lider";
    const filtro = app.filtroOcrStatus || "";
    let lista = Ocr.listar(state, { status: filtro || undefined });
    const datas = Ocr.datasCultoOpcoes(state);
    const hoje = Cal().hojeISO();
    const dataPadrao = datas.find((d) => d <= hoje) || datas[0] || hoje;

    const tiposOpts = (Ocr.TIPOS || [])
      .map((t) => `<option value="${t.id}">${UI().esc(t.label)}</option>`)
      .join("");
    const datasOpts = datas.length
      ? datas
          .map(
            (d) =>
              `<option value="${d}" ${d === dataPadrao ? "selected" : ""}>${UI().esc(Cal().diaSemana(d) + " — " + Cal().formatBR(d))}</option>`
          )
          .join("")
      : `<option value="${hoje}">${UI().esc(Cal().formatBR(hoje))}</option>`;

    const rows = lista
      .map((o) => {
        const st = Ocr.statusInfo(o.status);
        const acoes = isLider
          ? `${UI().btnIcon({ icon: "eye", label: "Abrir", variant: "ghost", attrs: { "data-act": "ver-ocr", "data-id": o.id } })}
             ${UI().btnIcon({ icon: "trash", label: "Excluir", variant: "danger", attrs: { "data-act": "del-ocr", "data-id": o.id } })}`
          : "";
        return `<tr class="no-click">
          <td>${UI().esc(Cal().formatBRCurto(o.data))}
            <div class="muted" style="font-size:12px">${UI().esc(Cal().diaSemana(o.data))}</div>
          </td>
          <td><strong>${UI().esc(o.titulo)}</strong>
            <div class="muted" style="font-size:12px">${UI().esc(Ocr.tipoLabel(o.tipo))} · ${UI().esc(o.criadoPorNome || "—")}</div>
          </td>
          <td><span class="badge badge-${st.tom}">${UI().esc(st.texto)}</span></td>
          <td class="muted" style="font-size:13px;max-width:260px">${UI().esc((o.descricao || "").slice(0, 100))}${(o.descricao || "").length > 100 ? "…" : ""}</td>
          ${isLider ? `<td class="toolbar">${acoes}</td>` : ""}
        </tr>`;
      })
      .join("");

    return `
      <div class="topbar">
        <div>
          <h1>Ocorrências</h1>
          <p class="sub">Registre o que aconteceu durante o culto (ausência, incidente, observação). Bugs do portal ficam em Relatar erro.</p>
        </div>
      </div>

      <div class="panel" style="margin-bottom:16px">
        <h2 style="margin-top:0">Nova ocorrência no culto</h2>
        <div class="grid grid-2">
          <label class="field"><span>Data do culto</span>
            <select id="ocr-data" class="select">${datasOpts}</select>
          </label>
          <label class="field"><span>Tipo</span>
            <select id="ocr-tipo" class="select">${tiposOpts}</select>
          </label>
        </div>
        <label class="field"><span>Título curto</span>
          <input id="ocr-titulo" class="input" maxlength="120" placeholder="Ex.: Diácono X não compareceu / portão emperrado"/>
        </label>
        <label class="field"><span>O que aconteceu?</span>
          <textarea id="ocr-desc" class="textarea" rows="4" placeholder="Descreva o fato durante o culto, horário aproximado e o que foi feito."></textarea>
        </label>
        <button type="button" class="btn btn-accent" id="btn-enviar-ocr">Registrar ocorrência</button>
      </div>

      <div class="panel">
        <div class="panel-head">
          <h2>Registros</h2>
          ${
            isLider
              ? `<label class="field" style="margin:0;min-width:160px"><span class="muted" style="font-size:12px">Status</span>
            <select id="filtro-ocr-st" class="select">
              <option value="">Todos</option>
              <option value="registrada" ${filtro === "registrada" ? "selected" : ""}>Registrada</option>
              <option value="vista" ${filtro === "vista" ? "selected" : ""}>Vista pela liderança</option>
              <option value="arquivada" ${filtro === "arquivada" ? "selected" : ""}>Arquivada</option>
            </select>
          </label>`
              : ""
          }
        </div>
        <div class="table-wrap">
          <table class="data">
            <thead><tr><th>Culto</th><th>Ocorrência</th><th>Status</th><th>Detalhe</th>${isLider ? "<th></th>" : ""}</tr></thead>
            <tbody>${
              rows ||
              `<tr class="no-click"><td colspan="${isLider ? 5 : 4}" class="empty">Nenhuma ocorrência registrada ainda.</td></tr>`
            }</tbody>
          </table>
        </div>
      </div>`;
  }

  function abrirDetalheOcorrencia(app, o) {
    const { state } = app;
    const Ocr = window.DiaconiaOcorrencias;
    const st = Ocr.statusInfo(o.status);
    UI().openModal(`
      <h2>${UI().esc(o.titulo)}</h2>
      <p class="muted" style="margin-top:0">
        ${UI().esc(Cal().diaSemana(o.data) + " — " + Cal().formatBR(o.data))} ·
        ${UI().esc(Ocr.tipoLabel(o.tipo))} · ${UI().esc(o.criadoPorNome || "—")} ·
        <span class="badge badge-${st.tom}">${UI().esc(st.texto)}</span>
      </p>
      <p style="white-space:pre-wrap">${UI().esc(o.descricao)}</p>
      <label class="field"><span>Status</span>
        <select id="ocr-st" class="select">
          <option value="registrada" ${o.status === "registrada" ? "selected" : ""}>Registrada</option>
          <option value="vista" ${o.status === "vista" ? "selected" : ""}>Vista pela liderança</option>
          <option value="arquivada" ${o.status === "arquivada" ? "selected" : ""}>Arquivada</option>
        </select>
      </label>
      <label class="field"><span>Nota da liderança (opcional)</span>
        <textarea id="ocr-nota" class="textarea" rows="3">${UI().esc(o.notaAdmin || "")}</textarea>
      </label>
      <div class="modal-actions">
        <button type="button" class="btn btn-ghost" data-act="cancel">Fechar</button>
        <button type="button" class="btn btn-accent" data-act="save">Salvar</button>
      </div>
    `);
    const m = document.getElementById("modal-root");
    m.addEventListener("click", (e) => {
      const act = e.target.closest("[data-act]")?.dataset.act;
      if (act === "cancel") return UI().closeModal();
      if (act !== "save") return;
      const res = Ocr.atualizar(
        state,
        o.id,
        {
          status: m.querySelector("#ocr-st")?.value || "registrada",
          notaAdmin: m.querySelector("#ocr-nota")?.value || "",
        },
        window.DiaconiaAuth.sessao()
      );
      if (!res.ok) return UI().toast(res.erro);
      UI().closeModal();
      app.save();
      app.render();
      UI().toast("Ocorrência atualizada.");
    });
  }

  function bindOcorrencias(app, root) {
    const { state } = app;
    const sessao = window.DiaconiaAuth.sessao();
    const Ocr = window.DiaconiaOcorrencias;

    root.querySelector("#filtro-ocr-st")?.addEventListener("change", (e) => {
      app.filtroOcrStatus = e.target.value || "";
      app.render();
    });

    root.querySelector("#btn-enviar-ocr")?.addEventListener("click", () => {
      if (!Ocr) return UI().toast("Serviço de ocorrências indisponível.");
      const res = Ocr.criar(
        state,
        {
          data: root.querySelector("#ocr-data")?.value,
          tipo: root.querySelector("#ocr-tipo")?.value,
          titulo: root.querySelector("#ocr-titulo")?.value,
          descricao: root.querySelector("#ocr-desc")?.value,
        },
        sessao
      );
      if (!res.ok) return UI().toast(res.erro);
      app.save();
      app.render();
      UI().toast("Ocorrência registrada.");
    });

    root.querySelectorAll('[data-act="del-ocr"]').forEach((btn) => {
      btn.addEventListener("click", async () => {
        const o = (state.ocorrencias || []).find((x) => x.id === btn.dataset.id);
        if (!o) return;
        const ok = await UI().confirmDelete({
          itemLabel: `a ocorrência <strong>${UI().esc(o.titulo)}</strong>`,
        });
        if (!ok) return;
        const res = Ocr.excluir(state, o.id, sessao);
        if (!res.ok) return UI().toast(res.erro);
        app.save();
        app.render();
        UI().toast("Ocorrência excluída.");
      });
    });

    root.querySelectorAll('[data-act="ver-ocr"]').forEach((btn) => {
      btn.addEventListener("click", () => {
        const o = (state.ocorrencias || []).find((x) => x.id === btn.dataset.id);
        if (o) abrirDetalheOcorrencia(app, o);
      });
    });
  }

  /* ——— Relatar erro (bugs do sistema) ——— */
  function relatar(app) {
    const { state } = app;
    const sessao = window.DiaconiaAuth.sessao();
    const Err = window.DiaconiaErrors;
    Err?.ensure?.(state);
    const meus = (state.relatosErro || [])
      .filter((r) => r.criadoPor === sessao?.usuarioId)
      .sort((a, b) => String(b.criadoEm).localeCompare(String(a.criadoEm)));

    const areas = (Err?.AREAS || [])
      .map((a) => `<option value="${a.id}">${UI().esc(a.label)}</option>`)
      .join("");

    const rows = meus
      .map((r) => {
        const st = Err.statusInfo(r.status);
        return `<tr class="no-click">
          <td>${UI().esc(r.criadoEm ? new Date(r.criadoEm).toLocaleString("pt-BR") : "—")}</td>
          <td><strong>${UI().esc(r.titulo)}</strong>
            <div class="muted" style="font-size:12px">${UI().esc(Err.areaLabel(r.area))}</div>
          </td>
          <td><span class="badge badge-${st.tom}">${UI().esc(st.texto)}</span></td>
          <td class="muted" style="font-size:13px;max-width:280px">${UI().esc((r.descricao || "").slice(0, 120))}${(r.descricao || "").length > 120 ? "…" : ""}</td>
        </tr>`;
      })
      .join("");

    return `
      <div class="topbar">
        <div>
          <h1>Relatar erro</h1>
          <p class="sub">Bugs do portal: tentou fazer algo e não conseguiu, ou apareceu mensagem de que não deu certo. Fatos do culto ficam em Ocorrências.</p>
        </div>
      </div>

      <div class="panel" style="margin-bottom:16px">
        <h2 style="margin-top:0">Novo relato</h2>
        <p class="muted settings-hint" style="margin-top:0">Não use para troca de escala ou “não posso ir” — isso fica em Avisos.</p>
        <label class="field"><span>Onde no sistema?</span>
          <select id="err-area" class="select">${areas}</select>
        </label>
        <label class="field"><span>Título curto</span>
          <input id="err-titulo" class="input" maxlength="120" placeholder="Ex.: Botão salvar não responde"/>
        </label>
        <label class="field"><span>O que aconteceu?</span>
          <textarea id="err-desc" class="textarea" rows="5" placeholder="O que você tentou fazer, o que esperava e o que apareceu (mensagem de erro, tela em branco, etc.)."></textarea>
        </label>
        <div class="toolbar">
          <button type="button" class="btn btn-accent" id="btn-enviar-erro">Enviar relato</button>
        </div>
      </div>

      <div class="panel">
        <div class="panel-head"><h2>Meus relatos</h2></div>
        <div class="table-wrap">
          <table class="data">
            <thead><tr><th>Quando</th><th>Problema</th><th>Status</th><th>Detalhe</th></tr></thead>
            <tbody>${rows || `<tr class="no-click"><td colspan="4" class="empty">Você ainda não enviou relatos.</td></tr>`}</tbody>
          </table>
        </div>
      </div>`;
  }

  function bindRelatar(app, root) {
    root.querySelector("#btn-enviar-erro")?.addEventListener("click", () => {
      const { state } = app;
      const sessao = window.DiaconiaAuth.sessao();
      if (!window.DiaconiaErrors) return UI().toast("Serviço de relatos indisponível.");
      const res = window.DiaconiaErrors.criar(
        state,
        {
          area: root.querySelector("#err-area")?.value || "outro",
          titulo: root.querySelector("#err-titulo")?.value || "",
          descricao: root.querySelector("#err-desc")?.value || "",
          pagina: app.page || "relatar",
        },
        sessao
      );
      if (!res.ok) return UI().toast(res.erro);
      app.save();
      app.render();
      UI().toast("Relato enviado. A liderança foi notificada.");
    });
  }

  const pages = {
    minha: { render: minhaEscala, bind: bindMinhaEscala },
    avisos: { render: avisos, bind: bindAvisos },
    conta: { render: conta, bind: bindConta },
    ocorrencias: { render: ocorrencias, bind: bindOcorrencias },
    relatar: { render: relatar, bind: bindRelatar },
  };

  return { pages };
})();
