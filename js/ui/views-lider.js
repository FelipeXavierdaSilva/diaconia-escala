/**
 * Views da liderança.
 */
window.DiaconiaViewsLider = (() => {
  const UI = () => window.DiaconiaUI;
  const Cal = () => window.DiaconiaCalendar;
  const Engine = () => window.DiaconiaEngine;

  function ctx(app) {
    return {
      state: app.state,
      ano: app.ano,
      mes: app.mes,
      save: () => app.save(),
      render: () => app.render(),
      setMes: (a, m) => app.setMes(a, m),
      sessao: () => window.DiaconiaAuth.sessao(),
    };
  }

  function bindMesSelectors(app, root) {
    UI().bindMesNav(app, root);
  }

  function lideresAtivos(state) {
    return (state.lideres || []).filter((l) => l.ativo !== false);
  }

  function toastWhatsappCadastro(wa) {
    if (!wa || wa.ignorado) return;
    if (wa.ok) {
      if (wa.via === "api") {
        UI().toast(
          wa.pendenteApi
            ? "WhatsApp enfileirado com login e senha (API ainda não configurada)."
            : `WhatsApp enviado para ${wa.nome || "o destinatário"} com login e senha.`
        );
        return;
      }
      if (wa.via === "manual_direto") {
        UI().toast(
          `WhatsApp aberto para ${wa.nome || "o destinatário"}. A mensagem com login e senha já está pronta para enviar.`
        );
        return;
      }
      UI().toast(`Mensagem copiada — escolha no painel: app instalado ou WhatsApp Web.`);
      return;
    }
    UI().toast(wa.erro || "WhatsApp não enviado — cadastre o número com DD (ex.: 47997845287).");
  }

  function compartilharCredenciaisUsuarioApp(app, usuario, senha) {
    if (!usuario?.senha && !senha) {
      UI().toast("Este usuário não tem senha cadastrada.");
      return null;
    }
    const { state } = ctx(app);
    const wa = window.DiaconiaWhatsApp?.compartilharCredenciaisUsuario?.(state, usuario, {
      senha: senha || usuario.senha,
    });
    if (!wa) {
      UI().toast("WhatsApp indisponível.");
      return null;
    }
    app.save();
    toastWhatsappCadastro(wa);
    return wa;
  }

  function whatsappDoUsuario(state, usuario) {
    if (!usuario) return "";
    if (usuario.whatsapp) return usuario.whatsapp;
    if (usuario.diaconoId) {
      return state.diaconos.find((d) => d.id === usuario.diaconoId)?.whatsapp || "";
    }
    if (usuario.papel === "lider") {
      return (state.lideres || []).find((l) => l.usuarioId === usuario.id)?.whatsapp || "";
    }
    return "";
  }

  function waDigits(raw) {
    if (window.DiaconiaWhatsApp?.normalizarNumeroInternacional) {
      return window.DiaconiaWhatsApp.normalizarNumeroInternacional(raw);
    }
    return String(raw || "").replace(/\D/g, "");
  }

  /** Usuário com papel liderança → entrada em state.lideres (visível aos diáconos). */
  function syncLiderDeUsuario(state, usuario, whatsappRaw) {
    if (!state.lideres) state.lideres = [];
    const wa = waDigits(whatsappRaw ?? usuario.whatsapp);
    usuario.whatsapp = wa;
    if (usuario.papel !== "lider") {
      state.lideres = state.lideres.filter((l) => l.usuarioId !== usuario.id);
      return;
    }
    let l = state.lideres.find((x) => x.usuarioId === usuario.id);
    if (!l) {
      l = {
        id: Engine().uid("l"),
        usuarioId: usuario.id,
        nome: usuario.nome,
        whatsapp: wa,
        ativo: true,
        /** Visível na aba Diáconos da liderança (quando tem perfil de escala) */
        apareceEmDiaconos: true,
      };
      state.lideres.push(l);
    } else {
      l.nome = usuario.nome;
      l.whatsapp = wa;
      if (l.ativo === undefined) l.ativo = true;
      if (l.apareceEmDiaconos === undefined) l.apareceEmDiaconos = true;
    }
  }

  function liderApareceNaAbaDiaconos(state, diaconoId) {
    const u = (state.usuarios || []).find(
      (x) => x.diaconoId === diaconoId && x.papel === "lider"
    );
    if (!u) return true;
    const l = (state.lideres || []).find((x) => x.usuarioId === u.id);
    if (!l) return true;
    return l.apareceEmDiaconos !== false;
  }

  function removerLiderDeUsuario(state, usuarioId) {
    state.lideres = (state.lideres || []).filter((l) => l.usuarioId !== usuarioId);
  }

  function syncDiaconoWhatsappDoUsuario(state, usuario, whatsappRaw) {
    if (!usuario?.diaconoId) return;
    const wa = waDigits(whatsappRaw ?? usuario.whatsapp);
    usuario.whatsapp = wa;
    const d = state.diaconos.find((x) => x.id === usuario.diaconoId);
    if (d) d.whatsapp = wa;
  }

  function equipePadrao(state) {
    const eq = (state.equipes || []).find((e) => e.ativa !== false);
    return eq?.id || "eq01";
  }

  /** Cria perfil mínimo de diácono — equipe/funções configuradas depois em Diáconos */
  function criarDiaconoMinimo(state, { nome, whatsapp = "" }) {
    const diacono = {
      id: Engine().uid("d"),
      nome,
      equipeId: equipePadrao(state),
      funcaoMinisterio: "",
      funcaoDiaconatoId: "",
      whatsapp: waDigits(whatsapp),
      restricaoPessoal: "",
      casado: false,
      conjugeNome: "",
      conjugeMembroIgreja: false,
      temFilhos: false,
      qtdFilhos: 0,
      filhos: [],
      filhosNomes: [],
      filhosVaoIgreja: false,
      funcoesPermitidas: ["*"],
      ativo: true,
    };
    state.diaconos.push(diacono);
    return diacono;
  }

  /**
   * Remove o perfil de escala (diácono) mantendo a conta de usuário.
   * Usado quando o líder desmarca “Entrar na escala”.
   */
  function removerPerfilEscalaMantendoUsuario(state, usuario) {
    const diaconoId = usuario?.diaconoId;
    if (!diaconoId) return;
    usuario.diaconoId = null;
    state.diaconos = (state.diaconos || []).filter((d) => d.id !== diaconoId);
    state.restricoes = (state.restricoes || []).filter((r) => r.diaconoId !== diaconoId);
    state.casais = (state.casais || []).filter(
      (c) => c.diaconoIdA !== diaconoId && c.diaconoIdB !== diaconoId
    );
    state.trocas = (state.trocas || []).filter(
      (t) => t.deDiaconoId !== diaconoId && t.paraDiaconoId !== diaconoId
    );
    for (const esc of Object.values(state.escalas || {})) {
      for (const eq of Object.values(esc.atribuicoes || {})) {
        for (const fid of Object.keys(eq || {})) {
          eq[fid] = (eq[fid] || []).filter((id) => id !== diaconoId);
        }
      }
      if (typeof Engine().statusEscala === "function") {
        esc.status = Engine().statusEscala(esc, state);
      }
    }
  }

  /**
   * Garante perfil em Diáconos para quem entra na escala.
   * Diácono: sempre. Líder: só se entrarNaEscala === true.
   */
  function garantirPerfilDiacono(state, usuario, { nome, whatsapp, entrarNaEscala }, usuarioLogId) {
    const naEscala =
      usuario.papel === "diacono" || (usuario.papel === "lider" && entrarNaEscala === true);

    if (!naEscala) {
      if (usuario.diaconoId) removerPerfilEscalaMantendoUsuario(state, usuario);
      return null;
    }

    let d = usuario.diaconoId ? state.diaconos.find((x) => x.id === usuario.diaconoId) : null;
    if (!d) {
      d = criarDiaconoMinimo(state, { nome, whatsapp });
      usuario.diaconoId = d.id;
      window.DiaconiaHistory.add(state, {
        tipo: "diacono",
        mensagem:
          usuario.papel === "lider"
            ? `Líder ${nome} incluído na escala — configure equipe e funções em Diáconos.`
            : `Perfil de diácono criado para ${nome} — configure equipe e funções em Diáconos.`,
        usuarioId: usuarioLogId,
      });
    } else {
      d.nome = nome;
      if (whatsapp) d.whatsapp = whatsapp;
      if (d.ativo === undefined) d.ativo = true;
    }
    return d;
  }

  /* ——— Escalas ——— */
  function escalas(app) {
    const { state, ano, mes } = ctx(app);
    const lista = Cal().escalasDoMes(state, ano, mes);
    const grade = Cal().gradeMes(ano, mes);

    const rows = lista
      .map((esc) => {
        const st = Engine().statusEscala(esc, state);
        const eqId = (esc.equipesIds || [])[0];
        const sEq = eqId ? Engine().statusEquipe(esc, eqId, state) : "vazia";
        const tom = sEq === "completa" ? "ok" : sEq === "vazia" ? "muted" : "warn";
        return `<tr data-data="${esc.data}">
          ${UI().bulkTd(esc.data, "escalas-lista")}
          <td>${UI().esc(Cal().formatBRCurto(esc.data))}<div class="muted" style="font-size:12px">${UI().esc(Cal().diaSemana(esc.data))}</div></td>
          <td>${UI().esc(esc.nome)}</td>
          <td><span class="badge badge-${tom}">${UI().esc(eqId ? UI().nomeEquipe(state, eqId) : "—")}</span></td>
          <td>${UI().badgeStatus(st)}</td>
          <td>
            <div class="toolbar">
              ${UI().btnIcon({ icon: "eye", label: "Abrir", variant: "ghost", attrs: { "data-act": "abrir", "data-data": esc.data } })}
              ${UI().btnIcon({ icon: "book", label: "Manual", variant: "primary", attrs: { "data-act": "montar", "data-data": esc.data, "data-eq": eqId || "" } })}
              ${UI().btnIcon({ icon: "pencil", label: "Editar", variant: "accent", attrs: { "data-act": "editar-dia", "data-data": esc.data } })}
            </div>
          </td>
        </tr>`;
      })
      .join("");

    const calCells = grade
      .map((iso) => {
        if (!iso) return `<div class="cal-day empty"></div>`;
        const day = +iso.split("-")[2];
        const esc = state.escalas[iso];
        if (!esc) return `<div class="cal-day"><span class="n">${day}</span></div>`;
        const st = Engine().statusEscala(esc, state);
        const info = Engine().labelStatus(st);
        const eqNome = esc.equipesIds?.[0] ? UI().nomeEquipe(state, esc.equipesIds[0]) : "";
        return `<div class="cal-day has-event" data-data="${iso}" title="${UI().esc(esc.nome + (eqNome ? " · " + eqNome : ""))}">
          <span class="n">${day}</span>
          <span class="mark" style="background:var(--${info.tom === "ok" ? "ok" : info.tom === "warn" ? "warn" : info.tom === "danger" ? "danger" : "muted"})"></span>
          ${eqNome ? `<span style="font-size:9px;font-weight:700;color:var(--teal);line-height:1">${UI().esc(eqNome.replace("Equipe ", "E"))}</span>` : ""}
        </div>`;
      })
      .join("");

    return `
      <div class="page-fit">
      <div class="topbar">
        <div>
          <h1>Escalas — ${UI().esc(Cal().nomeMes(mes))} ${ano}</h1>
          <p class="sub">Uma equipe por dia. Gere a escala automaticamente ou registre cultos e eventos manualmente.</p>
        </div>
        <div class="toolbar">
          ${UI().mesSelect(ano, mes)}
        </div>
      </div>

      <div class="toolbar toolbar-escalas">
        <button class="btn btn-accent" id="btn-gerar">Gerar escala</button>
        <button class="btn btn-ghost" id="btn-nova">+ Nova escala / evento</button>
        <button class="btn btn-ghost" id="btn-pdf">Gerar PDF</button>
      </div>

      <div class="view-tabs" role="tablist">
        <button type="button" class="view-tab active" data-view="cal">Calendário</button>
        <button type="button" class="view-tab" data-view="lista">Lista</button>
      </div>

      <div class="escalas-body">
        <div class="panel panel-lista" data-pane="lista">
          <div class="panel-head"><h2>Visão mensal</h2></div>
          ${UI().bulkBar("escalas-lista")}
          <div class="table-wrap table-fit">
            <table class="data" data-bulk-table="escalas-lista">
              <thead><tr>${UI().bulkTh("escalas-lista")}<th>Data</th><th>Evento</th><th>Equipe do dia</th><th>Status</th><th>Ações</th></tr></thead>
              <tbody id="tbl-escalas">${rows || `<tr class="no-click"><td colspan="6" class="empty">Nenhuma escala neste mês.</td></tr>`}</tbody>
            </table>
          </div>
        </div>
        <div class="panel panel-cal" data-pane="cal">
          <div class="panel-head"><h2>${UI().esc(Cal().nomeMes(mes).toUpperCase())} ${ano}</h2></div>
          <div class="cal-wrap">
            <div class="cal cal-fit">
              ${Cal().DIAS_CURTOS.map((d) => `<div class="cal-head">${d}</div>`).join("")}
              ${calCells}
            </div>
          </div>
        </div>
      </div>
      </div>
    `;
  }

  function bindEscalas(app, root) {
    bindMesSelectors(app, root);
    const { state, ano, mes } = ctx(app);

    const openDay = (data) => {
      window.DiaconiaEscalaModal.render(state, data, {
        isLider: true,
        onChange: () => {
          app.save();
          app.render();
        },
      });
    };

    root.querySelector("#tbl-escalas")?.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-act]");
      if (btn?.dataset.act === "editar-dia") {
        e.stopPropagation();
        window.DiaconiaEscalaModal.editarDiaEquipe(state, btn.dataset.data, {
          isLider: true,
          onChange: () => {
            app.save();
            app.render();
          },
        });
        return;
      }
      if (btn?.dataset.act === "montar") {
        e.stopPropagation();
        const data = btn.dataset.data;
        const eqId = btn.dataset.eq || state.escalas[data]?.equipesIds?.[0];
        if (!eqId) return UI().toast("Defina a equipe do dia antes.");
        window.DiaconiaEscalaModal.montarManual(state, data, eqId, {
          onDone: () => {
            app.save();
            app.render();
          },
        });
        return;
      }
      if (btn?.dataset.act === "abrir") {
        e.stopPropagation();
        openDay(btn.dataset.data);
        return;
      }
      const tr = e.target.closest("tr[data-data]");
      if (tr && !e.target.closest(".col-bulk")) openDay(tr.dataset.data);
    });
    root.querySelectorAll(".cal-day[data-data]").forEach((el) => {
      el.addEventListener("click", () => openDay(el.dataset.data));
    });

    root.querySelector("#btn-pdf")?.addEventListener("click", () => abrirModalGerarPDF(app));

    root.querySelector("#btn-gerar")?.addEventListener("click", () => abrirModalGerarEscala(app));

    root.querySelector("#btn-nova")?.addEventListener("click", () => formNovaEscala(app, "culto"));

    const setView = (view) => {
      app.escalaView = view;
      root.querySelectorAll(".view-tab").forEach((t) => t.classList.toggle("active", t.dataset.view === view));
      root.querySelector(".escalas-body")?.setAttribute("data-show", view);
    };
    root.querySelectorAll(".view-tab").forEach((tab) => {
      tab.addEventListener("click", () => setView(tab.dataset.view));
    });
    setView(app.escalaView || "cal");

    UI().bindBulkTable(root, "escalas-lista", {
      itemLabel: "escala(s)",
      onDelete: async (ids) => {
        for (const data of ids) delete state.escalas[data];
        window.DiaconiaHistory.add(state, {
          tipo: "escala",
          mensagem: `${ids.length} escala(s) excluída(s) em massa.`,
          usuarioId: ctx(app).sessao()?.usuarioId,
        });
        app.save();
        app.render();
        UI().toast(`${ids.length} escala(s) excluída(s).`);
      },
    });
  }

  function periodoGeracaoLabel(ano, mes, qtd) {
    const partes = [];
    let a = ano;
    let m = mes;
    for (let i = 0; i < qtd; i++) {
      partes.push(`${Cal().nomeMes(m)}/${a}`);
      m += 1;
      if (m > 12) {
        m = 1;
        a += 1;
      }
    }
    if (partes.length <= 3) return partes.join(", ");
    return `${partes[0]} … ${partes[partes.length - 1]} (${qtd} meses)`;
  }

  function abrirModalGerarEscala(app) {
    const { state, ano, mes } = ctx(app);
    const pendentes = (state.restricoes || []).filter((r) => r.status === "pendente").length;

    UI().openModal(`
      <h2>Gerar escala</h2>
      <p class="muted" style="margin-top:-4px">A geração começa em <strong>${UI().esc(Cal().nomeMes(mes))} ${ano}</strong> e respeita restrições aprovadas, funções e regras de Configurações.</p>
      <label class="field"><span>Quantos meses?</span>
        <input id="g-qtd-meses" class="input" type="number" min="1" max="12" value="1" inputmode="numeric"/>
      </label>
      <p class="muted" style="font-size:12px;margin:-6px 0 12px" id="g-periodo-preview">Período: ${UI().esc(periodoGeracaoLabel(ano, mes, 1))}</p>
      ${
        pendentes
          ? `<div class="alert alert-warn">Há ${pendentes} restrição(ões) pendente(s). Apenas as <strong>aprovadas</strong> entram na geração.</div>`
          : `<div class="alert alert-info">Domingos sem escala serão criados automaticamente. Escalas já existentes no período serão redistribuídas.</div>`
      }
      <div class="modal-actions">
        <button class="btn btn-ghost" data-act="cancel">Cancelar</button>
        <button class="btn btn-accent" data-act="gerar">Gerar escala</button>
      </div>
    `);

    const root = document.getElementById("modal-root");
    const input = root.querySelector("#g-qtd-meses");
    const preview = root.querySelector("#g-periodo-preview");
    input?.addEventListener("input", () => {
      const qtd = Math.min(12, Math.max(1, parseInt(input.value, 10) || 1));
      if (preview) preview.textContent = `Período: ${periodoGeracaoLabel(ano, mes, qtd)}`;
    });

    root.addEventListener("click", (e) => {
      const act = e.target.closest("[data-act]")?.dataset.act;
      if (act === "cancel") return UI().closeModal();
      if (act !== "gerar") return;

      const qtdMeses = Math.min(12, Math.max(1, parseInt(input?.value, 10) || 1));
      const res = Engine().gerarPeriodo(state, ano, mes, qtdMeses);
      window.DiaconiaHistory.add(state, {
        tipo: "gerar",
        mensagem: `Escala gerada: ${qtdMeses} mês(es) a partir de ${Cal().nomeMes(mes)}/${ano}${res.criadas ? ` (${res.criadas} culto(s) criado(s))` : ""}.`,
        usuarioId: ctx(app).sessao()?.usuarioId,
      });
      app.save();
      UI().closeModal();
      app.render();
      UI().toast(
        res.criadas
          ? `Escala gerada (${qtdMeses} mês${qtdMeses > 1 ? "es" : ""}, ${res.criadas} culto(s) novo(s)).`
          : `Escala gerada para ${qtdMeses} mês${qtdMeses > 1 ? "es" : ""}.`
      );
    });
  }

  function abrirModalGerarPDF(app) {
    const { state, ano, mes } = ctx(app);

    UI().openModal(`
      <h2>Gerar PDF</h2>
      <p class="muted" style="margin-top:-4px">Inclui apenas escalas já cadastradas no sistema.</p>
      <label class="field"><span><input type="radio" name="pdf-modo" id="pdf-modo-mes" value="mes" checked/> Mês atual — ${UI().esc(Cal().nomeMes(mes))} ${ano}</span></label>
      <label class="field"><span><input type="radio" name="pdf-modo" id="pdf-modo-tudo" value="tudo"/> Gerar tudo</span></label>
      <div class="modal-actions">
        <button class="btn btn-ghost" data-act="cancel">Cancelar</button>
        <button class="btn btn-accent" data-act="pdf">Gerar PDF</button>
      </div>
    `);

    const root = document.getElementById("modal-root");
    root.addEventListener("click", (e) => {
      const act = e.target.closest("[data-act]")?.dataset.act;
      if (act === "cancel") return UI().closeModal();
      if (act !== "pdf") return;

      const tudo = !!root.querySelector("#pdf-modo-tudo")?.checked;
      const res = tudo
        ? window.DiaconiaPDF.gerarTudo(state)
        : window.DiaconiaPDF.gerarMes(state, ano, mes);
      if (res?.ok === false) {
        UI().toast(res.erro || "Nenhuma escala cadastrada neste período.");
        return;
      }
      UI().closeModal();
    });
  }

  function sugerirEquipeDoDia(state, data) {
    const eqs = (state.equipes || []).filter((e) => e.ativa !== false).map((e) => e.id);
    if (!eqs.length) return "eq01";
    const anteriores = Object.keys(state.escalas || {})
      .filter((d) => d < data)
      .sort();
    if (!anteriores.length) return eqs[0];
    const ultima = state.escalas[anteriores[anteriores.length - 1]];
    const ultimaEq = ultima?.equipesIds?.[0];
    const idx = eqs.indexOf(ultimaEq);
    if (idx < 0) return eqs[0];
    return eqs[(idx + 1) % eqs.length];
  }

  function formNovaEscala(app, tipoPadrao) {
    const { state, ano, mes } = ctx(app);
    const domingos = Cal().domingosDoMes(ano, mes);
    const dataPadrao = domingos[0] || `${ano}-${String(mes).padStart(2, "0")}-01`;
    const sugerida = sugerirEquipeDoDia(state, dataPadrao);
    const eqs = state.equipes
      .filter((e) => e.ativa !== false)
      .map(
        (e) =>
          `<label><input type="radio" name="eq" value="${e.id}" ${e.id === sugerida ? "checked" : ""}/> ${UI().esc(e.nome)}</label>`
      )
      .join("");
    const funs = state.funcoes
      .map(
        (f) =>
          `<label><input type="checkbox" name="fn" value="${f.id}" ${state.funcoesPadraoCulto.includes(f.id) ? "checked" : ""}/> ${UI().esc(f.emoji + " " + f.nome)}</label>`
      )
      .join("");

    UI().openModal(`
      <h2>+ Nova escala / evento</h2>
      <label class="field"><span>Data</span><input type="date" id="f-data" value="${dataPadrao}"/></label>
      <label class="field"><span>Tipo</span>
        <select id="f-tipo" class="select">
          <option value="culto" ${tipoPadrao === "culto" ? "selected" : ""}>Culto</option>
          <option value="evento" ${tipoPadrao === "evento" ? "selected" : ""}>Evento</option>
          <option value="especial">Especial</option>
        </select>
      </label>
      <label class="field"><span>Nome</span><input id="f-nome" value="${tipoPadrao === "evento" ? "Conferência Especial" : "Culto"}"/></label>
      <label class="field"><span>Horário</span><input id="f-hora" value="19:00"/></label>
      <label class="field"><span>Descrição (opcional)</span><textarea id="f-desc" class="textarea" rows="2"></textarea></label>
      <p><strong>Equipe responsável do dia</strong></p>
      <p class="muted" style="font-size:13px;margin-top:-4px">Cada data fica com <strong>uma</strong> equipe. A sugestão alterna com o culto anterior.</p>
      <div class="radio-list">${eqs}</div>
      <p><strong>Funções</strong></p>
      <div class="check-list" style="max-height:160px;overflow:auto">${funs}</div>
      <div class="modal-actions">
        <button class="btn btn-ghost" data-act="cancel">Cancelar</button>
        <button class="btn btn-accent" data-act="criar">Criar escala</button>
      </div>
    `);

    const root = document.getElementById("modal-root");
    root.querySelector("#f-data")?.addEventListener("change", (e) => {
      const sug = sugerirEquipeDoDia(state, e.target.value);
      const radio = root.querySelector(`input[name="eq"][value="${sug}"]`);
      if (radio) radio.checked = true;
    });

    root.addEventListener("click", (e) => {
      const act = e.target.closest("[data-act]")?.dataset.act;
      if (act === "cancel") {
        UI().closeModal();
        return;
      }
      if (act !== "criar") return;
      const data = root.querySelector("#f-data").value;
      if (!data) {
        UI().toast("Informe a data.");
        return;
      }
      const eqSel = root.querySelector('input[name="eq"]:checked')?.value;
      const funcoesIds = [...root.querySelectorAll('input[name="fn"]:checked')].map((i) => i.value);
      if (!eqSel) {
        UI().toast("Selecione a equipe responsável do dia.");
        return;
      }
      if (!funcoesIds.length) {
        UI().toast("Selecione as funções.");
        return;
      }
      if (state.escalas[data]) {
        UI().toast("Já existe escala nesta data. Abra o dia e use Editar.");
        return;
      }
      const esc = window.DiaconiaSeed.criarEscalaBase(
        data,
        root.querySelector("#f-tipo").value,
        root.querySelector("#f-nome").value,
        root.querySelector("#f-hora").value,
        [eqSel]
      );
      esc.funcoesIds = funcoesIds;
      esc.descricao = root.querySelector("#f-desc").value;
      state.escalas[data] = esc;
      window.DiaconiaHistory.add(state, {
        tipo: "criar",
        mensagem: `Escala criada em ${data}: ${esc.nome} (${UI().nomeEquipe(state, eqSel)}).`,
        usuarioId: ctx(app).sessao()?.usuarioId,
      });
      app.save();
      UI().closeModal();
      app.render();
      UI().toast("Escala criada.");
    });
  }

  /* ——— Diáconos ——— */
  function normalizarNome(nome) {
    return String(nome || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .trim();
  }

  function letraInicial(nome) {
    const n = normalizarNome(nome);
    const ch = n.charAt(0);
    return ch >= "a" && ch <= "z" ? ch : "#";
  }

  function diaconos(app) {
    const { state } = ctx(app);
    const letra = app.filtroDiaconoLetra || "todos";
    const busca = app.filtroDiaconoBusca || "";
    const ordem = app.filtroDiaconoOrdem || "az";

    let lista = [...state.diaconos].filter((d) => liderApareceNaAbaDiaconos(state, d.id));
    lista.sort((a, b) =>
      a.nome.localeCompare(b.nome, "pt-BR", { sensitivity: "base" })
    );
    if (ordem === "za") lista.reverse();

    if (letra && letra !== "todos") {
      lista = lista.filter((d) => letraInicial(d.nome) === letra);
    }
    if (busca.trim()) {
      const q = normalizarNome(busca);
      lista = lista.filter((d) => {
        const nomeFn = d.funcaoDiaconatoId
          ? UI().nomeFuncao(state, d.funcaoDiaconatoId)
          : "";
        return (
          normalizarNome(d.nome).includes(q) ||
          normalizarNome(d.funcaoMinisterio || "").includes(q) ||
          normalizarNome(nomeFn).includes(q)
        );
      });
    }

    const letras = "abcdefghijklmnopqrstuvwxyz".split("");
    const letrasOpts = [
      `<option value="todos" ${letra === "todos" ? "selected" : ""}>Todas</option>`,
      ...letras.map(
        (l) => `<option value="${l}" ${letra === l ? "selected" : ""}>${l.toUpperCase()}</option>`
      ),
      `<option value="#" ${letra === "#" ? "selected" : ""}>#</option>`,
    ].join("");

    const rows = lista
      .map((d) => {
        const casal = Engine().infoCasal(state, d.id);
        const parceiro = casal ? UI().nomeDiacono(state, casal.parceiroId) : null;
        const ministerio = (d.funcaoMinisterio || "").trim();
        const diaconato = d.funcaoDiaconatoId
          ? UI().nomeFuncao(state, d.funcaoDiaconatoId)
          : "";
        const familia = UI().resumoFamiliaCurto(d);
        return `<tr class="no-click" data-id="${d.id}">
        ${UI().bulkTd(d.id, "diaconos")}
        <td>${UI().badgeAtivo(d.ativo)}</td>
        <td>${UI().esc(d.nome)}${parceiro ? `<div class="muted" style="font-size:12px">💑 ${UI().esc(parceiro)}</div>` : ""}</td>
        <td>${UI().esc(UI().nomeEquipe(state, d.equipeId))}</td>
        <td>${ministerio ? UI().esc(ministerio) : `<span class="muted">—</span>`}</td>
        <td>${diaconato ? UI().esc(diaconato) : `<span class="muted">—</span>`}</td>
        <td style="font-size:12px">${familia}</td>
        <td>${
          window.DiaconiaWhatsApp?.numeroValido?.(d.whatsapp)
            ? `<span class="badge badge-ok" title="${UI().esc(d.whatsapp)}">WA</span>`
            : `<span class="badge badge-muted" title="Sem WhatsApp">—</span>`
        }</td>
        <td>
          <div class="toolbar">
            ${UI().btnIcon({ icon: "eye", label: "Ver dados pessoais", variant: "ghost", attrs: { "data-act": "preview-d", "data-id": d.id } })}
            ${UI().btnIcon({ icon: "pencil", label: "Editar", variant: "ghost", attrs: { "data-act": "edit", "data-id": d.id } })}
            ${UI().btnIcon({ icon: "trash", label: "Excluir", variant: "danger", attrs: { "data-act": "remove-d", "data-id": d.id } })}
          </div>
        </td>
      </tr>`;
      })
      .join("");

    return `
      <div class="topbar">
        <div>
          <h1>Diáconos</h1>
          <p class="sub">Cadastro completo. Líderes só listados aqui se “Aparece na aba Diáconos” estiver marcado em Configurações. <span class="muted">${lista.length} de ${state.diaconos.length}</span></p>
        </div>
        <div class="diaconos-tools">
          <input type="search" id="filtro-busca-d" class="input input-slim" placeholder="Buscar…" value="${UI().esc(busca)}" aria-label="Buscar nome"/>
          <select id="filtro-letra-d" class="select select-slim" aria-label="Filtrar por letra">${letrasOpts}</select>
          <select id="filtro-ordem-d" class="select select-slim" aria-label="Ordem">
            <option value="az" ${ordem === "az" ? "selected" : ""}>A → Z</option>
            <option value="za" ${ordem === "za" ? "selected" : ""}>Z → A</option>
          </select>
          <button class="btn btn-accent" id="btn-add-d">+ Adicionar diácono</button>
        </div>
      </div>
      <div class="panel">
        ${UI().bulkBar("diaconos")}
        <div class="table-wrap">
          <table class="data" data-bulk-table="diaconos">
            <thead><tr>${UI().bulkTh("diaconos")}<th>Status</th><th>Nome</th><th>Equipe</th><th>Ministério</th><th>Diaconato</th><th>Família</th><th>WA</th><th>Ação</th></tr></thead>
            <tbody>${rows || `<tr class="no-click"><td colspan="9" class="empty">Nenhum diácono neste filtro.</td></tr>`}</tbody>
          </table>
        </div>
      </div>`;
  }

  function bindDiaconos(app, root) {
    const { state } = ctx(app);
    root.querySelector("#btn-add-d")?.addEventListener("click", () => formDiacono(app));

    root.querySelector("#filtro-letra-d")?.addEventListener("change", (e) => {
      app.filtroDiaconoLetra = e.target.value;
      app.render();
    });

    root.querySelector("#filtro-ordem-d")?.addEventListener("change", (e) => {
      app.filtroDiaconoOrdem = e.target.value;
      app.render();
    });

    const busca = root.querySelector("#filtro-busca-d");
    let timer;
    busca?.addEventListener("input", () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        app.filtroDiaconoBusca = busca.value;
        app.render();
        const el = document.querySelector("#filtro-busca-d");
        if (el) {
          el.focus();
          const len = el.value.length;
          el.setSelectionRange(len, len);
        }
      }, 180);
    });

    root.querySelectorAll('[data-act="edit"]').forEach((btn) => {
      btn.addEventListener("click", () => {
        const d = state.diaconos.find((x) => x.id === btn.dataset.id);
        formDiacono(app, d);
      });
    });
    root.querySelectorAll('[data-act="preview-d"]').forEach((btn) => {
      btn.addEventListener("click", () => {
        const d = state.diaconos.find((x) => x.id === btn.dataset.id);
        if (!d) return;
        UI().openModal(`
          <h2>Dados pessoais — ${UI().esc(d.nome)}</h2>
          ${UI().previewDadosPessoaisHtml(d, {
            titulo: "Cadastro atual",
            vazio: "Sem dados pessoais.",
          })}
          <p class="muted" style="font-size:12px;margin:0">Alterações feitas pelo diácono em Minha conta aparecem aqui automaticamente.</p>
          <div class="modal-actions">
            <button class="btn btn-ghost" data-act="cancel">Fechar</button>
            <button class="btn btn-accent" data-act="edit-from-preview" data-id="${UI().esc(d.id)}">Editar cadastro</button>
          </div>
        `);
        const modal = document.getElementById("modal-root");
        modal?.querySelector('[data-act="edit-from-preview"]')?.addEventListener("click", () => {
          UI().closeModal();
          formDiacono(app, d);
        });
        modal?.querySelector('[data-act="cancel"]')?.addEventListener("click", () => UI().closeModal());
      });
    });
    root.querySelectorAll('[data-act="remove-d"]').forEach((btn) => {
      btn.addEventListener("click", () => {
        const d = state.diaconos.find((x) => x.id === btn.dataset.id);
        confirmarExclusaoDiacono(app, d);
      });
    });

    UI().bindBulkTable(root, "diaconos", {
      itemLabel: "diácono(s)",
      onDelete: async (ids) => {
        for (const id of ids) removerDiaconoDoEstado(state, id);
        window.DiaconiaHistory.add(state, {
          tipo: "diacono",
          mensagem: `${ids.length} diácono(s) excluído(s) em massa.`,
          usuarioId: ctx(app).sessao()?.usuarioId,
        });
        app.save();
        app.render();
        UI().toast(`${ids.length} diácono(s) excluído(s).`);
      },
    });
  }

  function formDiacono(app, diacono = null, opts = {}) {
    const { state } = ctx(app);
    const eqPadrao = diacono?.equipeId || opts.equipeId || state.equipes[0]?.id;
    const eqOpts = state.equipes
      .map(
        (e) =>
          `<option value="${e.id}" ${eqPadrao === e.id ? "selected" : ""}>${UI().esc(e.nome)}</option>`
      )
      .join("");
    const fnDiacOpts = [
      `<option value="">— Selecionar —</option>`,
      ...state.funcoes.map(
        (f) =>
          `<option value="${f.id}" ${diacono?.funcaoDiaconatoId === f.id ? "selected" : ""}>${UI().esc(f.emoji + " " + f.nome)}</option>`
      ),
    ].join("");
    const all = !diacono || diacono.funcoesPermitidas?.includes("*");
    const funChecks = state.funcoes
      .map(
        (f) =>
          `<label><input type="checkbox" name="fn" value="${f.id}" ${
            all || diacono?.funcoesPermitidas?.includes(f.id) ? "checked" : ""
          }/> ${UI().esc(f.emoji + " " + f.nome)}</label>`
      )
      .join("");

    UI().openModal(`
      <h2>${diacono ? "Editar" : "Novo"} diácono</h2>
      <p class="muted" style="margin:-4px 0 14px;font-size:13px">Dados pessoais abaixo são os mesmos que o diácono vê em <strong>Minha conta</strong>.</p>
      ${UI().dadosPessoaisFormHtml("d", diacono, {
        labelCasado: "Casado(a)",
        labelFilhos: "Tem filhos",
        labelConjuge: "Cônjuge",
        showWhatsappHint: true,
      })}
      <hr style="border:none;border-top:1px solid var(--line);margin:16px 0"/>
      <h3 style="margin:0 0 12px;font-size:15px">Configuração da liderança</h3>
      <label class="field"><span>Equipe</span><select id="d-eq" class="select">${eqOpts}</select></label>
      <label class="field"><span>Função no diaconato</span>
        <select id="d-diaconato" class="select">${fnDiacOpts}</select>
      </label>
      <label class="field"><span><input type="checkbox" id="d-all" ${all ? "checked" : ""}/> Pode servir em todas as funções</span></label>
      <div class="check-list" id="d-funs" style="max-height:180px;overflow:auto">${funChecks}</div>
      <p class="muted" style="font-size:12px;margin:0">As caixas acima limitam o que o gerador pode atribuir. A “função no diaconato” é o papel principal deste diácono.</p>
      <label class="field"><span><input type="checkbox" id="d-ativo" ${diacono?.ativo !== false ? "checked" : ""}/> Ativo (pode ser escalado)</span></label>
      <p class="muted" style="font-size:12px;margin:-8px 0 12px">Desmarcado = <strong>Inativo</strong> — não entra na geração automática nem na montagem manual da escala.</p>
      <div class="modal-actions">
        ${diacono ? `<button class="btn btn-danger" data-act="delete" style="margin-right:auto">Excluir</button>` : ""}
        <button class="btn btn-ghost" data-act="cancel">Cancelar</button>
        <button class="btn btn-accent" data-act="save">Salvar</button>
      </div>
    `, { wide: true });

    const root = document.getElementById("modal-root");
    const sync = () => {
      root.querySelector("#d-funs").style.opacity = root.querySelector("#d-all").checked ? "0.4" : "1";
    };
    root.querySelector("#d-all").addEventListener("change", sync);
    sync();
    UI().bindDadosPessoaisForm(root, "d");

    root.addEventListener("click", async (e) => {
      const act = e.target.closest("[data-act]")?.dataset.act;
      if (act === "cancel") return UI().closeModal();
      if (act === "delete" && diacono) {
        UI().closeModal();
        await confirmarExclusaoDiacono(app, diacono);
        return;
      }
      if (act !== "save") return;
      const dados = UI().lerDadosPessoaisForm(root, "d");
      const err = UI().validarDadosPessoaisForm(dados);
      if (err) return UI().toast(err);
      const funcaoDiaconatoId = root.querySelector("#d-diaconato").value;
      const funcoesPermitidas = root.querySelector("#d-all").checked
        ? ["*"]
        : [...root.querySelectorAll('input[name="fn"]:checked')].map((i) => i.value);
      if (diacono) {
        const oldEq = diacono.equipeId;
        UI().aplicarDadosPessoais(diacono, dados);
        diacono.equipeId = root.querySelector("#d-eq").value;
        diacono.funcaoDiaconatoId = funcaoDiaconatoId;
        diacono.funcoesPermitidas = funcoesPermitidas;
        diacono.ativo = root.querySelector("#d-ativo").checked;
        const u = (state.usuarios || []).find((x) => x.diaconoId === diacono.id);
        if (u) {
          u.nome = dados.nome;
          u.whatsapp = waDigits(dados.whatsapp);
        }
        if (oldEq !== diacono.equipeId) {
          window.DiaconiaHistory.add(state, {
            tipo: "migracao",
            mensagem: `${dados.nome} migrado de equipe.`,
            usuarioId: ctx(app).sessao()?.usuarioId,
          });
        }
      } else {
        const id = Engine().uid("d");
        const novo = {
          id,
          equipeId: root.querySelector("#d-eq").value,
          funcaoDiaconatoId,
          funcoesPermitidas,
          ativo: root.querySelector("#d-ativo").checked,
          temFilhos: false,
          qtdFilhos: 0,
          filhos: [],
          filhosNomes: [],
          filhosVaoIgreja: false,
          conjugeMembroIgreja: false,
        };
        UI().aplicarDadosPessoais(novo, dados);
        state.diaconos.push(novo);
        const senhaPadrao = "123456";
        const novoUsuario = {
          id: Engine().uid("u"),
          login: loginUnico(state, dados.nome),
          senha: senhaPadrao,
          nome: dados.nome,
          papel: "diacono",
          diaconoId: id,
          whatsapp: novo.whatsapp || "",
        };
        state.usuarios.push(novoUsuario);
        window.DiaconiaStorage.touchUsuario?.(novoUsuario);
        window.DiaconiaHistory.add(state, {
          tipo: "usuario",
          mensagem: `Usuário criado automaticamente: ${novoUsuario.login} (diácono).`,
          usuarioId: ctx(app).sessao()?.usuarioId,
        });
        const sync = await app.saveAndSync();
        const wa = window.DiaconiaWhatsApp?.notificarCadastroUsuario?.(state, novoUsuario, {
          senha: senhaPadrao,
        });
        if (wa?.ok || (wa && !wa.ignorado)) app.save();
        UI().closeModal();
        app.render();
        if (sync?.ok) {
          UI().toast("Diácono salvo e sincronizado no servidor.");
        } else {
          UI().toast("Diácono salvo neste aparelho — confirme a sincronização salvando de novo.");
        }
        toastWhatsappCadastro(wa);
        return;
      }
      app.save();
      UI().closeModal();
      app.render();
      UI().toast("Diácono salvo.");
    });
  }

  function loginUnico(state, nome, exceptId = null) {
    const base = String(nome || "usuario")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "")
      .slice(0, 18) || "usuario";
    let login = base;
    let n = 2;
    while (
      (state.usuarios || []).some(
        (u) => u.login.toLowerCase() === login && u.id !== exceptId
      )
    ) {
      login = `${base}${n++}`;
    }
    return login;
  }

  /* ——— Equipes ——— */
  function equipes(app) {
    const { state } = ctx(app);
    const cards = state.equipes
      .map((eq) => {
        const members = state.diaconos.filter((d) => d.equipeId === eq.id);
        return `<div class="panel">
          <div class="panel-head">
            <h2>${UI().esc(eq.nome)}${
              eq.nomeDefinido
                ? ""
                : ` <span class="badge badge-warn" title="O diácono ainda não vê este nome">Nome interno</span>`
            }</h2>
            <div class="toolbar">
              ${UI().btnIcon({ icon: "pencil", label: "Definir / editar nome", variant: "ghost", attrs: { "data-act": "rename", "data-id": eq.id } })}
              ${UI().btnIcon({ icon: "trash", label: "Remover", variant: "danger", attrs: { "data-act": "remove", "data-id": eq.id } })}
            </div>
          </div>
          <p class="muted">${members.length} diácono(s)${
            eq.nomeDefinido ? "" : " · defina o nome para aparecer aos diáconos"
          }</p>
          <div class="chips">${
            members
              .map((m) => {
                const cls = m.ativo !== false ? "chip chip-member" : "chip chip-member chip-inactive";
                return `<span class="${cls}" data-act="edit-d" data-id="${m.id}" title="Editar ${UI().esc(m.nome)}">${UI().badgeAtivo(m.ativo)} ${UI().esc(m.nome)}<button type="button" class="chip-x" data-act="remove-d" data-id="${m.id}" title="Excluir ${UI().esc(m.nome)}" aria-label="Excluir ${UI().esc(m.nome)}">×</button></span>`;
              })
              .join("") || `<span class="muted">Nenhum diácono nesta equipe.</span>`
          }</div>
          <div class="toolbar" style="margin-top:12px">
            <button class="btn btn-accent btn-sm" data-act="add-d" data-id="${eq.id}">+ Adicionar diácono</button>
          </div>
        </div>`;
      })
      .join("");

    return `
      <div class="topbar">
        <div><h1>Equipes</h1><p class="sub">Defina o nome da equipe para que apareça aos diáconos. Até lá, o nome fica só interno.</p></div>
        <button class="btn btn-accent" id="btn-add-eq">+ Adicionar equipe</button>
      </div>
      <div class="grid grid-2">${cards}</div>`;
  }

  function bindEquipes(app, root) {
    const { state } = ctx(app);
    root.querySelector("#btn-add-eq")?.addEventListener("click", () => {
      const nome = prompt("Nome da equipe (visível aos diáconos):");
      if (!nome || !nome.trim()) return;
      state.equipes.push({
        id: Engine().uid("eq"),
        nome: nome.trim(),
        nomeDefinido: true,
        ativa: true,
      });
      window.DiaconiaHistory.add(state, {
        tipo: "equipe",
        mensagem: `Equipe ${nome.trim()} criada.`,
        usuarioId: ctx(app).sessao()?.usuarioId,
      });
      app.save();
      app.render();
    });
    root.querySelectorAll('[data-act="rename"]').forEach((btn) => {
      btn.addEventListener("click", () => {
        const eq = state.equipes.find((e) => e.id === btn.dataset.id);
        const nome = prompt("Nome da equipe (visível aos diáconos):", eq.nome || "");
        if (!nome || !nome.trim()) return;
        eq.nome = nome.trim();
        eq.nomeDefinido = true;
        app.save();
        app.render();
        UI().toast("Nome da equipe definido. Agora aparece para os diáconos.");
      });
    });
    root.querySelectorAll('[data-act="remove"]').forEach((btn) => {
      btn.addEventListener("click", async () => {
        const eq = state.equipes.find((e) => e.id === btn.dataset.id);
        const membros = (state.diaconos || []).filter((d) => d.equipeId === btn.dataset.id);
        if (membros.length) {
          return UI().toast(
            `Não é possível excluir: ${membros.length} diácono(s) nesta equipe. Mova-os antes.`
          );
        }
        const ok = await UI().confirmDelete({
          itemLabel: `a equipe <strong>${UI().esc(eq?.nome || "")}</strong>`,
          detalhes: "Equipes sem membros podem ser removidas com segurança.",
        });
        if (!ok) return;
        state.equipes = state.equipes.filter((e) => e.id !== btn.dataset.id);
        app.save();
        app.render();
      });
    });
    root.querySelectorAll('[data-act="remove-d"]').forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const d = state.diaconos.find((x) => x.id === btn.dataset.id);
        confirmarExclusaoDiacono(app, d);
      });
    });
    root.querySelectorAll('[data-act="edit-d"]').forEach((btn) => {
      btn.addEventListener("click", (e) => {
        if (e.target.closest("[data-act='remove-d']")) return;
        const d = state.diaconos.find((x) => x.id === btn.dataset.id);
        formDiacono(app, d);
      });
    });
    root.querySelectorAll('[data-act="add-d"]').forEach((btn) => {
      btn.addEventListener("click", () => formDiacono(app, null, { equipeId: btn.dataset.id }));
    });
  }

  function removerDiaconoDoEstado(state, diaconoId) {
    state.diaconos = (state.diaconos || []).filter((d) => d.id !== diaconoId);
    state.usuarios = (state.usuarios || []).filter((u) => u.diaconoId !== diaconoId);
    state.restricoes = (state.restricoes || []).filter((r) => r.diaconoId !== diaconoId);
    state.casais = (state.casais || []).filter(
      (c) => c.diaconoIdA !== diaconoId && c.diaconoIdB !== diaconoId
    );
    state.trocas = (state.trocas || []).filter(
      (t) => t.deDiaconoId !== diaconoId && t.paraDiaconoId !== diaconoId
    );

    for (const esc of Object.values(state.escalas || {})) {
      for (const eq of Object.values(esc.atribuicoes || {})) {
        for (const fid of Object.keys(eq || {})) {
          eq[fid] = (eq[fid] || []).filter((id) => id !== diaconoId);
        }
      }
      if (typeof Engine().statusEscala === "function") {
        esc.status = Engine().statusEscala(esc, state);
      }
    }
  }

  async function confirmarExclusaoDiacono(app, d) {
    if (!d) return;
    const { state } = ctx(app);
    const ok = await UI().confirmDelete({
      itemLabel: `o diácono <strong>${UI().esc(d.nome)}</strong>`,
      detalhes: "Ele será removido da equipe, das escalas, das restrições e do acesso de usuário.",
    });
    if (!ok) return;
    removerDiaconoDoEstado(state, d.id);
    window.DiaconiaHistory.add(state, {
      tipo: "diacono",
      mensagem: `Diácono excluído: ${d.nome}.`,
      usuarioId: ctx(app).sessao()?.usuarioId,
    });
    app.save();
    app.render();
    UI().toast(`${d.nome} excluído.`);
  }

  /* ——— Casais ——— */
  function casais(app) {
    const { state } = ctx(app);
    const rows = (state.casais || [])
      .map((c) => {
        const modo = c.preferirMesmaFuncao
          ? "Mesmo dia + mesma função"
          : c.preferirMesmoDia
            ? "Mesmo dia (funções livres)"
            : "Sem preferência de dia";
        return `<tr class="no-click">
          ${UI().bulkTd(c.id, "casais")}
          <td><strong>${UI().esc(Engine().nomeCasal(state, c))}</strong>
            ${c.observacao ? `<div class="muted" style="font-size:12px">${UI().esc(c.observacao)}</div>` : ""}
          </td>
          <td>${UI().esc(modo)}</td>
          <td>${c.ativo !== false ? UI().badgeStatus("completa") : UI().badgeStatus("incompleta")}</td>
          <td class="toolbar">
            ${UI().btnIcon({ icon: "pencil", label: "Editar", variant: "ghost", attrs: { "data-act": "edit-c", "data-id": c.id } })}
            ${UI().btnIcon({ icon: "trash", label: "Excluir", variant: "danger", attrs: { "data-act": "del-c", "data-id": c.id } })}
          </td>
        </tr>`;
      })
      .join("");

    return `
      <div class="topbar">
        <div>
          <h1>💑 Casais</h1>
          <p class="sub">Defina quem forma casal. O gerador tenta colocar os dois no mesmo culto; a mesma função só quando você marcar.</p>
        </div>
        <button class="btn btn-accent" id="btn-add-casal">+ Novo casal</button>
      </div>
      <div class="alert alert-info" style="margin-bottom:14px">
        <strong>Como funciona:</strong> com “preferir mesmo dia”, ao escalar um, o sistema tenta escalar o cônjuge no mesmo culto em outra função.
        Marque “mesma função” só quando os dois devem servir juntos no mesmo item (ex.: Lanche).
        Restrições e vagas sempre têm prioridade.
      </div>
      <div class="panel">
        ${UI().bulkBar("casais")}
        <div class="table-wrap"><table class="data" data-bulk-table="casais">
          <thead><tr>${UI().bulkTh("casais")}<th>Casal</th><th>Preferência</th><th>Status</th><th>Ações</th></tr></thead>
          <tbody>${rows || `<tr class="no-click"><td colspan="5" class="empty">Nenhum casal cadastrado.</td></tr>`}</tbody>
        </table></div>
      </div>`;
  }

  function bindCasais(app, root) {
    const { state } = ctx(app);
    root.querySelector("#btn-add-casal")?.addEventListener("click", () => formCasal(app));
    root.querySelectorAll('[data-act="edit-c"]').forEach((btn) => {
      btn.addEventListener("click", () => {
        formCasal(app, state.casais.find((c) => c.id === btn.dataset.id));
      });
    });
    root.querySelectorAll('[data-act="del-c"]').forEach((btn) => {
      btn.addEventListener("click", async () => {
        const c = state.casais.find((x) => x.id === btn.dataset.id);
        if (!c) return;
        const ok = await UI().confirmDelete({
          itemLabel: `o casal <strong>${UI().esc(Engine().nomeCasal(state, c))}</strong>`,
          detalhes: "O vínculo deixa de influenciar a geração de escala.",
        });
        if (!ok) return;
        state.casais = state.casais.filter((x) => x.id !== c.id);
        window.DiaconiaHistory.add(state, {
          tipo: "casal",
          mensagem: `Casal removido: ${Engine().nomeCasal(state, c)}.`,
          usuarioId: ctx(app).sessao()?.usuarioId,
        });
        app.save();
        app.render();
        UI().toast("Casal excluído.");
      });
    });

    UI().bindBulkTable(root, "casais", {
      itemLabel: "casal(is)",
      onDelete: async (ids) => {
        const set = new Set(ids);
        state.casais = (state.casais || []).filter((x) => !set.has(x.id));
        window.DiaconiaHistory.add(state, {
          tipo: "casal",
          mensagem: `${ids.length} casal(is) removido(s) em massa.`,
          usuarioId: ctx(app).sessao()?.usuarioId,
        });
        app.save();
        app.render();
        UI().toast(`${ids.length} casal(is) excluído(s).`);
      },
    });
  }

  function formCasal(app, casal = null) {
    const { state } = ctx(app);
    const ocupados = new Set();
    for (const c of state.casais || []) {
      if (casal && c.id === casal.id) continue;
      ocupados.add(c.diaconoIdA);
      ocupados.add(c.diaconoIdB);
    }

    const opts = (selectedId) =>
      state.diaconos
        .filter((d) => d.ativo !== false && (!ocupados.has(d.id) || d.id === selectedId))
        .map(
          (d) =>
            `<option value="${d.id}" ${d.id === selectedId ? "selected" : ""}>${UI().esc(d.nome)} (${UI().esc(UI().nomeEquipe(state, d.equipeId))})</option>`
        )
        .join("");

    UI().openModal(`
      <h2>${casal ? "Editar" : "Novo"} casal</h2>
      <label class="field"><span>Diácono A</span><select id="c-a" class="select">${opts(casal?.diaconoIdA)}</select></label>
      <label class="field"><span>Diácono B</span><select id="c-b" class="select">${opts(casal?.diaconoIdB)}</select></label>
      <label class="field"><span><input type="checkbox" id="c-dia" ${casal?.preferirMesmoDia !== false ? "checked" : ""}/> Preferir servir no mesmo dia/culto</span></label>
      <label class="field"><span><input type="checkbox" id="c-func" ${casal?.preferirMesmaFuncao ? "checked" : ""}/> Preferir a mesma função (mesmo item)</span></label>
      <p class="muted" style="font-size:13px;margin-top:-6px">Deixe “mesma função” desmarcado quando cada um puder ficar em itens diferentes no mesmo culto.</p>
      <label class="field"><span>Observação</span><textarea id="c-obs" class="textarea" rows="2">${UI().esc(casal?.observacao || "")}</textarea></label>
      <label class="field"><span><input type="checkbox" id="c-ativo" ${casal?.ativo !== false ? "checked" : ""}/> Ativo</span></label>
      <div class="modal-actions">
        <button class="btn btn-ghost" data-act="cancel">Cancelar</button>
        <button class="btn btn-accent" data-act="save">Salvar</button>
      </div>
    `);

    const m = document.getElementById("modal-root");
    m.addEventListener("click", (e) => {
      const act = e.target.closest("[data-act]")?.dataset.act;
      if (act === "cancel") return UI().closeModal();
      if (act !== "save") return;
      const a = m.querySelector("#c-a").value;
      const b = m.querySelector("#c-b").value;
      if (!a || !b) return UI().toast("Selecione os dois diáconos.");
      if (a === b) return UI().toast("Escolha duas pessoas diferentes.");

      const da = state.diaconos.find((d) => d.id === a);
      const db = state.diaconos.find((d) => d.id === b);
      if (da?.equipeId !== db?.equipeId) {
        UI().toast("Atenção: estão em equipes diferentes — o gerador só junta casal na mesma equipe.");
      }

      const payload = {
        diaconoIdA: a,
        diaconoIdB: b,
        preferirMesmoDia: m.querySelector("#c-dia").checked,
        preferirMesmaFuncao: m.querySelector("#c-func").checked,
        ativo: m.querySelector("#c-ativo").checked,
        observacao: m.querySelector("#c-obs").value.trim(),
      };

      if (casal) Object.assign(casal, payload);
      else state.casais.push({ id: Engine().uid("c"), ...payload });

      window.DiaconiaHistory.add(state, {
        tipo: "casal",
        mensagem: `Casal ${casal ? "atualizado" : "criado"}: ${UI().nomeDiacono(state, a)} & ${UI().nomeDiacono(state, b)}.`,
        usuarioId: ctx(app).sessao()?.usuarioId,
      });
      app.save();
      UI().closeModal();
      app.render();
      UI().toast("Casal salvo.");
    });
  }

  /* ——— Funções ——— */
  function funcoes(app) {
    const { state } = ctx(app);
    const rows = state.funcoes
      .map(
        (f) => `<tr class="no-click">
        ${UI().bulkTd(f.id, "funcoes")}
        <td>${UI().esc(f.emoji)} ${UI().esc(f.nome)}</td>
        <td>${UI().esc(f.horario)}</td>
        <td>${f.qtdPorEquipe}</td>
        <td class="toolbar">
          ${UI().btnIcon({ icon: "pencil", label: "Editar", variant: "ghost", attrs: { "data-act": "edit-f", "data-id": f.id } })}
          ${UI().btnIcon({ icon: "trash", label: "Excluir", variant: "danger", attrs: { "data-act": "del-f", "data-id": f.id } })}
        </td>
      </tr>`
      )
      .join("");
    return `
      <div class="topbar">
        <div><h1>Funções</h1><p class="sub">Horários, quantidade e instruções. Edite ou exclua cada função.</p></div>
        <button class="btn btn-accent" id="btn-add-f">+ Nova função</button>
      </div>
      <div class="panel">${UI().bulkBar("funcoes")}<div class="table-wrap"><table class="data" data-bulk-table="funcoes">
        <thead><tr>${UI().bulkTh("funcoes")}<th>Função</th><th>Horário</th><th>Qtd/equipe</th><th>Ações</th></tr></thead>
        <tbody>${rows || `<tr class="no-click"><td colspan="5" class="empty">Nenhuma função cadastrada.</td></tr>`}</tbody>
      </table></div></div>`;
  }

  function removerFuncaoDoEstado(state, funcaoId) {
    state.funcoes = state.funcoes.filter((f) => f.id !== funcaoId);
    state.funcoesPadraoCulto = (state.funcoesPadraoCulto || []).filter((id) => id !== funcaoId);

    for (const esc of Object.values(state.escalas || {})) {
      esc.funcoesIds = (esc.funcoesIds || []).filter((id) => id !== funcaoId);
      for (const eq of Object.values(esc.atribuicoes || {})) {
        if (eq && eq[funcaoId] !== undefined) delete eq[funcaoId];
      }
      esc.problemas = (esc.problemas || []).filter((p) => p.funcaoId !== funcaoId);
      if (typeof Engine().statusEscala === "function") {
        esc.status = Engine().statusEscala(esc, state);
      }
    }

    for (const d of state.diaconos || []) {
      if (Array.isArray(d.funcoesPermitidas) && !d.funcoesPermitidas.includes("*")) {
        d.funcoesPermitidas = d.funcoesPermitidas.filter((id) => id !== funcaoId);
      }
      if (d.funcaoDiaconatoId === funcaoId) d.funcaoDiaconatoId = "";
    }

    for (const r of state.restricoes || []) {
      if (r.funcaoId === funcaoId) r.funcaoId = null;
    }
  }

  function bindFuncoes(app, root) {
    const { state } = ctx(app);
    const openForm = (f = null) => {
      UI().openModal(`
        <h2>${f ? "Editar" : "Nova"} função</h2>
        <label class="field"><span>Nome</span><input id="fn-nome" value="${UI().esc(f?.nome || "")}"/></label>
        <label class="field"><span>Emoji</span><input id="fn-emoji" value="${UI().esc(f?.emoji || "📋")}"/></label>
        <label class="field"><span>Horário</span><input id="fn-hora" value="${UI().esc(f?.horario || "18:00")}" placeholder="18:00 ou Final"/></label>
        <label class="field"><span>Qtd por equipe</span><input type="number" min="1" id="fn-qtd" value="${f?.qtdPorEquipe || 1}"/></label>
        <label class="field"><span>Instruções</span><textarea id="fn-inst" class="textarea" rows="4">${UI().esc(f?.instrucoes || "")}</textarea></label>
        <div class="modal-actions">
          ${f ? `<button class="btn btn-danger" data-act="delete" style="margin-right:auto">Excluir</button>` : ""}
          <button class="btn btn-ghost" data-act="cancel">Cancelar</button>
          <button class="btn btn-accent" data-act="save">Salvar</button>
        </div>
      `);
      const m = document.getElementById("modal-root");
      m.addEventListener("click", async (e) => {
        const act = e.target.closest("[data-act]")?.dataset.act;
        if (act === "cancel") return UI().closeModal();

        if (act === "delete" && f) {
          UI().closeModal();
          await confirmarExclusao(f);
          return;
        }

        if (act !== "save") return;
        const payload = {
          nome: m.querySelector("#fn-nome").value.trim(),
          emoji: m.querySelector("#fn-emoji").value.trim(),
          horario: m.querySelector("#fn-hora").value.trim(),
          qtdPorEquipe: Math.max(1, +m.querySelector("#fn-qtd").value || 1),
          instrucoes: m.querySelector("#fn-inst").value.trim(),
        };
        if (!payload.nome) return UI().toast("Informe o nome.");
        if (f) {
          Object.assign(f, payload);
          window.DiaconiaHistory.add(state, {
            tipo: "funcao",
            mensagem: `Função editada: ${f.nome}.`,
            usuarioId: ctx(app).sessao()?.usuarioId,
          });
        } else {
          const id = Engine().uid("fn");
          state.funcoes.push({ id, ...payload });
          window.DiaconiaHistory.add(state, {
            tipo: "funcao",
            mensagem: `Função criada: ${payload.nome}.`,
            usuarioId: ctx(app).sessao()?.usuarioId,
          });
        }
        app.save();
        UI().closeModal();
        app.render();
        UI().toast("Função salva.");
      });
    };

    async function confirmarExclusao(f) {
      const ok = await UI().confirmDelete({
        itemLabel: `a função <strong>${UI().esc(f.emoji)} ${UI().esc(f.nome)}</strong>`,
        detalhes: "A função será removida das escalas, do padrão de culto e das permissões dos diáconos.",
      });
      if (!ok) return;
      removerFuncaoDoEstado(state, f.id);
      window.DiaconiaHistory.add(state, {
        tipo: "funcao",
        mensagem: `Função excluída: ${f.nome}.`,
        usuarioId: ctx(app).sessao()?.usuarioId,
      });
      app.save();
      app.render();
      UI().toast("Função excluída.");
    }

    root.querySelector("#btn-add-f")?.addEventListener("click", () => openForm());
    root.querySelectorAll('[data-act="edit-f"]').forEach((btn) => {
      btn.addEventListener("click", () => openForm(state.funcoes.find((x) => x.id === btn.dataset.id)));
    });
    root.querySelectorAll('[data-act="del-f"]').forEach((btn) => {
      btn.addEventListener("click", async () => {
        const f = state.funcoes.find((x) => x.id === btn.dataset.id);
        if (f) await confirmarExclusao(f);
      });
    });

    UI().bindBulkTable(root, "funcoes", {
      itemLabel: "função(ões)",
      onDelete: async (ids) => {
        for (const id of ids) removerFuncaoDoEstado(state, id);
        window.DiaconiaHistory.add(state, {
          tipo: "funcao",
          mensagem: `${ids.length} função(ões) excluída(s) em massa.`,
          usuarioId: ctx(app).sessao()?.usuarioId,
        });
        app.save();
        app.render();
        UI().toast(`${ids.length} função(ões) excluída(s).`);
      },
    });
  }

  /* ——— Restrições ——— */
  function motivoAviso(r) {
    const obs = String(r.observacao || "");
    if (/emergência/i.test(obs)) return "Emergência";
    if (/ministério/i.test(obs)) return "Outro ministério";
    const tipoLabel = {
      indisponivel: "Não pode participar",
      funcao: "Função bloqueada",
      horario: "Chega mais tarde",
      outro: "Outro",
    };
    return tipoLabel[r.tipo] || r.tipo;
  }

  function badgeStatusAviso(st) {
    const map = {
      pendente: { texto: "Aguardando você", tom: "warn" },
      aprovada: { texto: "Aprovado", tom: "ok" },
      rejeitada: { texto: "Recusado", tom: "danger" },
    };
    const info = map[st] || { texto: st, tom: "muted" };
    return `<span class="badge badge-${info.tom}">${UI().esc(info.texto)}</span>`;
  }

  function restricoes(app) {
    const { state } = ctx(app);
    const lista = [...(state.restricoes || [])].sort((a, b) =>
      String(b.criadaEm || b.data || "").localeCompare(String(a.criadaEm || a.data || ""))
    );
    const pendentes = lista.filter((r) => r.status === "pendente");
    const demais = lista.filter((r) => r.status !== "pendente");

    function rowHtml(r) {
      const d = state.diaconos.find((x) => x.id === r.diaconoId);
      return `<tr class="no-click">
        ${UI().bulkTd(r.id, "avisos-lider")}
        <td>${UI().esc(Cal().formatBR(r.data))}</td>
        <td><strong>${UI().esc(d?.nome || "—")}</strong></td>
        <td>${UI().esc(motivoAviso(r))}${r.funcaoId ? " · " + UI().esc(UI().nomeFuncao(state, r.funcaoId)) : ""}${r.horarioChegada ? " · chega " + UI().esc(r.horarioChegada) : ""}</td>
        <td>${UI().esc(r.observacao || "—")}</td>
        <td>${badgeStatusAviso(r.status)}</td>
        <td>
          <div class="toolbar">
            ${
              r.status === "pendente"
                ? `${UI().btnIcon({ icon: "check", label: "Aprovar", variant: "primary", attrs: { "data-act": "apr", "data-id": r.id } })}
                   ${UI().btnIcon({ icon: "x", label: "Recusar", variant: "ghost", attrs: { "data-act": "rej", "data-id": r.id } })}`
                : r.afetacoes?.length
                  ? UI().btnIcon({ icon: "refresh", label: "Reorganizar", variant: "accent", attrs: { "data-act": "reorg", "data-data": r.data } })
                  : ""
            }
            ${UI().btnIcon({ icon: "pencil", label: "Editar", variant: "ghost", attrs: { "data-act": "edit-r", "data-id": r.id } })}
            ${UI().btnIcon({ icon: "trash", label: "Excluir", variant: "danger", attrs: { "data-act": "del-r", "data-id": r.id } })}
          </div>
        </td>
      </tr>`;
    }

    const cardsPendentes = pendentes
      .map((r) => {
        const d = state.diaconos.find((x) => x.id === r.diaconoId);
        return `<div class="panel notif-action" style="padding:14px">
          <div class="toolbar" style="justify-content:space-between;margin-bottom:6px">
            <strong>${UI().esc(d?.nome || "Diácono")}</strong>
            ${badgeStatusAviso(r.status)}
          </div>
          <p style="margin:0"><strong>${UI().esc(Cal().formatBR(r.data))}</strong> · ${UI().esc(motivoAviso(r))}</p>
          ${r.observacao ? `<p class="muted" style="margin:6px 0 0">${UI().esc(r.observacao)}</p>` : ""}
          <div class="toolbar" style="margin-top:12px">
            <button class="btn btn-primary btn-sm" data-act="apr" data-id="${r.id}">Aprovar</button>
            <button class="btn btn-ghost btn-sm" data-act="rej" data-id="${r.id}">Recusar</button>
            ${UI().btnIcon({ icon: "pencil", label: "Editar", variant: "ghost", attrs: { "data-act": "edit-r", "data-id": r.id } })}
          </div>
        </div>`;
      })
      .join("");

    return `
      <div class="topbar">
        <div>
          <h1>Avisos</h1>
          <p class="sub">Avisos de “não posso ir” enviados pelos diáconos. Aprove antes de gerar a escala.</p>
        </div>
        <button class="btn btn-accent" id="btn-nova-rest">+ Registrar aviso</button>
      </div>

      ${
        pendentes.length
          ? `<div class="alert alert-warn" style="margin-bottom:14px">
              <strong>${pendentes.length}</strong> aviso(s) aguardando sua aprovação.
            </div>
            <div style="margin-bottom:16px">
              <h2 style="font-size:16px;margin:0 0 10px">Precisam da sua resposta</h2>
              <div class="grid grid-2">${cardsPendentes}</div>
            </div>`
          : `<div class="alert alert-info" style="margin-bottom:14px">Nenhum aviso pendente no momento.</div>`
      }

      <div class="panel">
        <div class="panel-head"><h2>Histórico de avisos</h2></div>
        ${UI().bulkBar("avisos-lider")}
        <div class="table-wrap"><table class="data" data-bulk-table="avisos-lider">
          <thead><tr>${UI().bulkTh("avisos-lider")}<th>Data</th><th>Diácono</th><th>Motivo</th><th>Obs.</th><th>Status</th><th>Ação</th></tr></thead>
          <tbody>${
            [...pendentes, ...demais].map(rowHtml).join("") ||
            `<tr class="no-click"><td colspan="7" class="empty">Nenhum aviso ainda. Quando um diácono clicar em “Não posso ir”, aparece aqui.</td></tr>`
          }</tbody>
        </table></div>
      </div>`;
  }

  function formRestricaoLider(app, restricao = null) {
    const { state } = ctx(app);
    const diacOpts = state.diaconos
      .filter((d) => d.ativo !== false || d.id === restricao?.diaconoId)
      .map(
        (d) =>
          `<option value="${d.id}" ${restricao?.diaconoId === d.id ? "selected" : ""}>${UI().esc(d.nome)} (${UI().esc(UI().nomeEquipe(state, d.equipeId))})</option>`
      )
      .join("");
    const funOpts = state.funcoes
      .map(
        (f) =>
          `<option value="${f.id}" ${restricao?.funcaoId === f.id ? "selected" : ""}>${UI().esc(f.emoji + " " + f.nome)}</option>`
      )
      .join("");
    const tipo = restricao?.tipo || "indisponivel";

    UI().openModal(`
      <h2>${restricao ? "Editar" : "+ Nova"} restrição</h2>
      <label class="field"><span>Diácono</span><select id="r-diac" class="select">${diacOpts}</select></label>
      <label class="field"><span>Data</span><input type="date" id="r-data" value="${UI().esc(restricao?.data || "2026-09-13")}"/></label>
      <p><strong>Tipo</strong></p>
      <div class="radio-list">
        <label><input type="radio" name="rtype" value="indisponivel" ${tipo === "indisponivel" ? "checked" : ""}/> Não poderá participar</label>
        <label><input type="radio" name="rtype" value="funcao" ${tipo === "funcao" ? "checked" : ""}/> Não poderá realizar determinada função</label>
        <label><input type="radio" name="rtype" value="horario" ${tipo === "horario" ? "checked" : ""}/> Não poderá chegar no horário</label>
        <label><input type="radio" name="rtype" value="outro" ${tipo === "outro" ? "checked" : ""}/> Outro</label>
      </div>
      <label class="field" id="wrap-fn"><span>Função</span><select id="r-fn" class="select">${funOpts}</select></label>
      <label class="field" id="wrap-hora"><span>Consegue chegar a partir de</span><input id="r-hora" value="${UI().esc(restricao?.horarioChegada || "18:30")}"/></label>
      <label class="field"><span>Observação</span><textarea id="r-obs" class="textarea" rows="3" placeholder="Ex.: Compromisso pessoal.">${UI().esc(restricao?.observacao || "")}</textarea></label>
      <label class="field"><span>Status</span>
        <select id="r-status" class="select">
          <option value="pendente" ${restricao?.status === "pendente" ? "selected" : ""}>Pendente</option>
          <option value="aprovada" ${!restricao || restricao?.status === "aprovada" ? "selected" : ""}>Aprovada</option>
          <option value="rejeitada" ${restricao?.status === "rejeitada" ? "selected" : ""}>Rejeitada</option>
        </select>
      </label>
      <div class="modal-actions">
        ${restricao ? `<button class="btn btn-danger" data-act="delete" style="margin-right:auto">Excluir</button>` : ""}
        <button class="btn btn-ghost" data-act="cancel">Cancelar</button>
        <button class="btn btn-accent" data-act="send">Salvar</button>
      </div>
    `);

    const m = document.getElementById("modal-root");
    const sync = () => {
      const t = m.querySelector('input[name="rtype"]:checked').value;
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
        await excluirRestricaoConfirmada(app, restricao);
        return;
      }

      if (act !== "send") return;

      const tipoSel = m.querySelector('input[name="rtype"]:checked').value;
      const data = m.querySelector("#r-data").value;
      const diaconoId = m.querySelector("#r-diac").value;
      if (!data) return UI().toast("Informe a data.");
      if (!diaconoId) return UI().toast("Selecione o diácono.");

      const payload = {
        diaconoId,
        data,
        tipo: tipoSel,
        funcaoId: tipoSel === "funcao" ? m.querySelector("#r-fn").value : null,
        horarioChegada: tipoSel === "horario" ? m.querySelector("#r-hora").value : null,
        observacao: m.querySelector("#r-obs").value.trim(),
        status: m.querySelector("#r-status").value,
      };

      let res;
      if (restricao) {
        res = window.DiaconiaRestrictions.atualizar(state, restricao.id, payload, ctx(app).sessao());
      } else {
        res = window.DiaconiaRestrictions.criar(state, payload, ctx(app).sessao());
      }

      if (res.ok === false) return UI().toast(res.erro);

      app.save();
      UI().closeModal();
      if (res.afetacoes?.length || res.restricao?.afetacoes?.length) {
        UI().toast("Restrição salva — escala pode estar afetada.");
      } else {
        UI().toast(restricao ? "Restrição atualizada." : "Restrição cadastrada.");
      }
      app.render();
    });
  }

  async function excluirRestricaoConfirmada(app, r) {
    if (!r) return;
    const { state } = ctx(app);
    const nome = UI().nomeDiacono(state, r.diaconoId);
    const ok = await UI().confirmDelete({
      itemLabel: `a restrição de <strong>${UI().esc(nome)}</strong> em <strong>${UI().esc(Cal().formatBR(r.data))}</strong>`,
      detalhes:
        r.status === "aprovada"
          ? "Se estiver aprovada, ela deixará de ser considerada nas próximas gerações de escala."
          : "A restrição será removida da lista.",
    });
    if (!ok) return;
    const res = window.DiaconiaRestrictions.excluir(state, r.id, ctx(app).sessao());
    if (!res.ok) return UI().toast(res.erro);
    app.save();
    app.render();
    UI().toast("Restrição excluída.");
  }

  function bindRestricoes(app, root) {
    const { state } = ctx(app);
    root.querySelector("#btn-nova-rest")?.addEventListener("click", () => formRestricaoLider(app));

    root.querySelectorAll("[data-act]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const act = btn.dataset.act;
        if (act === "edit-r") {
          formRestricaoLider(
            app,
            state.restricoes.find((x) => x.id === btn.dataset.id)
          );
          return;
        }
        if (act === "del-r") {
          await excluirRestricaoConfirmada(
            app,
            state.restricoes.find((x) => x.id === btn.dataset.id)
          );
          return;
        }
        if (act === "reorg") {
          const ok = await UI().confirmModal({
            title: "Reorganizar escala",
            body: `<p>Gerar nova distribuição para <strong>${UI().esc(Cal().formatBR(btn.dataset.data))}</strong> respeitando as restrições atuais?</p>`,
            okText: "Reorganizar",
          });
          if (!ok) return;
          try {
            const gen = Engine().gerarEscalaData(state, btn.dataset.data);
            if (!gen?.ok) return UI().toast(gen?.erro || "Não foi possível reorganizar.");
            window.DiaconiaHistory.add(state, {
              tipo: "reorganizar",
              mensagem: `Escala ${btn.dataset.data} reorganizada após restrição.`,
              usuarioId: ctx(app).sessao()?.usuarioId,
            });
            app.save();
            app.render();
            UI().toast("Escala reorganizada.");
          } catch (err) {
            UI().toast(err.message || "Não foi possível reorganizar.");
          }
          return;
        }
        if (act !== "apr" && act !== "rej") return;
        const status = act === "apr" ? "aprovada" : "rejeitada";
        const res = window.DiaconiaRestrictions.setStatus(state, btn.dataset.id, status, ctx(app).sessao());
        if (!res.ok) return UI().toast(res.erro);
        app.save();
        app.render();
        if (res.restricao.afetacoes?.length) {
          UI().toast("Aprovada — escala afetada. Reorganize a data.");
        } else         UI().toast(`Restrição ${status}.`);
      });
    });

    UI().bindBulkTable(root, "avisos-lider", {
      itemLabel: "aviso(s)",
      onDelete: async (ids) => {
        const sessao = ctx(app).sessao();
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
  }

  /* ——— Troca / Cobrir ——— */
  function badgeTroca(status) {
    return UI().badgeTroca(status);
  }

  function badgeModalidade(mod) {
    if (mod === "cobertura") return `<span class="badge badge-warn">Cobrir</span>`;
    return `<span class="badge badge-ok">Troca</span>`;
  }

  function slotsTrocaDoMes(state, ano, mes) {
    const lista = [];
    for (const esc of Cal().escalasDoMes(state, ano, mes)) {
      for (const [eqId, funcoes] of Object.entries(esc.atribuicoes || {})) {
        for (const [fid, ids] of Object.entries(funcoes || {})) {
          for (const id of ids || []) {
            lista.push({ data: esc.data, equipeId: eqId, funcaoId: fid, diaconoId: id });
          }
        }
      }
    }
    return lista.sort((a, b) => a.data.localeCompare(b.data) || a.diaconoId.localeCompare(b.diaconoId));
  }

  function funcaoDoDiaconoNaData(state, diaconoId, data) {
    const esc = state.escalas[data];
    for (const [eqId, funcoes] of Object.entries(esc?.atribuicoes || {})) {
      for (const [fid, ids] of Object.entries(funcoes || {})) {
        if ((ids || []).includes(diaconoId)) return { equipeId: eqId, funcaoId: fid };
      }
    }
    return null;
  }

  function optionsSlotsTroca(state, slots) {
    return slots
      .map((s) => {
        const f = UI().nomeFuncao(state, s.funcaoId);
        const eq = UI().nomeEquipe(state, s.equipeId);
        const nome = UI().nomeDiacono(state, s.diaconoId);
        return `<option value="${s.data}|${s.equipeId}|${s.funcaoId}|${s.diaconoId}">${UI().esc(
          `${Cal().formatBR(s.data)} — ${nome} · ${f} (${eq})`
        )}</option>`;
      })
      .join("");
  }

  function trocas(app) {
    const { state } = ctx(app);
    const rows = [...(state.trocas || [])]
      .sort((a, b) => (b.criadaEm || "").localeCompare(a.criadaEm || ""))
      .map((t) => {
        const a = UI().nomeDiacono(state, t.deDiaconoId);
        const b = UI().nomeDiacono(state, t.paraDiaconoId);
        const seta = t.modalidade === "cobertura" ? "← cobriu" : "↔";
        return `<tr class="no-click">
          ${UI().bulkTd(t.id, "trocas-lider")}
          <td>${UI().esc(Cal().formatBR(t.data))}</td>
          <td>${badgeModalidade(t.modalidade)}</td>
          <td>${UI().esc(a)} ${seta} ${UI().esc(b)}</td>
          <td>${UI().esc(UI().nomeFuncao(state, t.funcaoId))}</td>
          <td>${badgeTroca(t.status)}</td>
          <td class="toolbar">
            ${
              t.status === "aguardando_lider"
                ? `${UI().btnIcon({ icon: "check", label: "Aprovar", variant: "primary", attrs: { "data-act": "ok", "data-id": t.id } })}
                   ${UI().btnIcon({ icon: "x", label: "Rejeitar", variant: "danger", attrs: { "data-act": "no", "data-id": t.id } })}`
                : "—"
            }
          </td>
        </tr>`;
      })
      .join("");
    return `
      <div class="topbar">
        <div>
          <h1>Troca / Cobrir</h1>
          <p class="sub"><strong>Troca</strong> = permuta de funções. <strong>Cobrir</strong> = outra pessoa assume (mesma ou outra equipe) e quem saiu fica fora. Entre diáconos, vale no aceite — sem aprovação da liderança.</p>
        </div>
        <button class="btn btn-accent" id="btn-nova-troca">+ Nova troca/cobertura</button>
      </div>
      <div class="panel">${UI().bulkBar("trocas-lider")}<div class="table-wrap"><table class="data" data-bulk-table="trocas-lider">
        <thead><tr>${UI().bulkTh("trocas-lider")}<th>Data</th><th>Tipo</th><th>Pessoas</th><th>Função</th><th>Status</th><th>Ação</th></tr></thead>
        <tbody>${
          rows ||
          `<tr class="no-click"><td colspan="7" class="empty">Nenhum registro. Clique em “+ Nova troca/cobertura”.</td></tr>`
        }</tbody>
      </table></div></div>`;
  }

  function bindTrocas(app, root) {
    const { state } = ctx(app);
    root.querySelector("#btn-nova-troca")?.addEventListener("click", () => formTrocaLider(app));
    root.querySelectorAll('[data-act="ok"], [data-act="no"]').forEach((btn) => {
      btn.addEventListener("click", () => {
        const res =
          btn.dataset.act === "ok"
            ? window.DiaconiaSwaps.aprovar(state, btn.dataset.id, ctx(app).sessao())
            : window.DiaconiaSwaps.rejeitar(state, btn.dataset.id, ctx(app).sessao());
        if (!res.ok) return UI().toast(res.erro);
        app.save();
        app.render();
        UI().toast(btn.dataset.act === "ok" ? "Pedido aprovado." : "Pedido rejeitado.");
      });
    });

    UI().bindBulkTable(root, "trocas-lider", {
      itemLabel: "registro(s) de troca",
      onDelete: async (ids) => {
        const set = new Set(ids);
        for (const t of state.trocas || []) {
          if (!set.has(t.id)) continue;
          if (t.escalaAplicada && t.escalaSnapshot && state.escalas[t.data]) {
            state.escalas[t.data].atribuicoes = JSON.parse(JSON.stringify(t.escalaSnapshot));
            state.escalas[t.data].status = Engine().statusEscala(state.escalas[t.data], state);
          }
        }
        state.trocas = (state.trocas || []).filter((t) => !set.has(t.id));
        state.notificacoes = (state.notificacoes || []).filter((n) => !set.has(n.meta?.trocaId));
        window.DiaconiaHistory.add(state, {
          tipo: "troca",
          mensagem: `${ids.length} registro(s) de troca excluído(s) em massa.`,
          usuarioId: ctx(app).sessao()?.usuarioId,
        });
        app.save();
        app.render();
        UI().toast(`${ids.length} registro(s) excluído(s).`);
      },
    });
  }

  function formTrocaLider(app) {
    const { state, ano, mes } = ctx(app);
    const slotsIniciais = slotsTrocaDoMes(state, ano, mes);
    if (!slotsIniciais.length) {
      UI().toast("Gere a escala deste mês em Escalas antes de registrar troca/cobertura.");
      return;
    }

    const mesesOpts = Cal()
      .MESES.map((n, i) => `<option value="${i + 1}" ${i + 1 === mes ? "selected" : ""}>${n}</option>`)
      .join("");

    UI().openModal(`
      <h2>Nova troca / cobertura</h2>
      <p class="muted" style="margin-top:-6px">A escala oficial é atualizada na hora. Quem cobre pode ser da mesma ou de outra equipe.</p>
      <p><strong>Tipo</strong></p>
      <div class="radio-list">
        <label><input type="radio" name="t-mod" value="troca" checked/> <strong>Troca</strong> — permuta (se o outro já estiver escalado no dia, as funções são invertidas)</label>
        <label><input type="radio" name="t-mod" value="cobertura"/> <strong>Cobrir</strong> — outra pessoa assume a função; quem saiu fica fora deste dia</label>
      </div>
      <div class="toolbar" style="margin-bottom:12px">
        <label class="field" style="margin:0;flex:1">
          <span class="muted" style="font-size:12px">Mês</span>
          <select class="select" id="t-mes">${mesesOpts}</select>
        </label>
      </div>
      <label class="field"><span id="t-label-de">Quem sai / precisa de cobertura</span><select id="t-part" class="select">${optionsSlotsTroca(
        state,
        slotsIniciais
      )}</select></label>
      <label class="field"><span id="t-label-para">Quem entra / cobre</span><select id="t-com" class="select"></select></label>
      <p class="muted" id="t-dica" style="font-size:13px;min-height:1.4em"></p>
      <div class="modal-actions">
        <button class="btn btn-ghost" data-act="cancel">Cancelar</button>
        <button class="btn btn-accent" data-act="apply">Registrar</button>
      </div>
    `);

    const m = document.getElementById("modal-root");

    const modalidade = () => m.querySelector('input[name="t-mod"]:checked')?.value || "troca";

    const fillCom = () => {
      const part = m.querySelector("#t-part").value;
      const com = m.querySelector("#t-com");
      const dica = m.querySelector("#t-dica");
      if (!part) {
        com.innerHTML = "";
        dica.textContent = "";
        return;
      }
      const [data, , , deId] = part.split("|");
      const outros = (state.diaconos || []).filter((d) => d.id !== deId && d.ativo !== false);
      com.innerHTML = outros
        .map((d) => {
          const ja = funcaoDoDiaconoNaData(state, d.id, data);
          const extra = ja ? ` — já em ${UI().nomeFuncao(state, ja.funcaoId)}` : " — livre neste dia";
          return `<option value="${d.id}">${UI().esc(d.nome)} (${UI().esc(UI().nomeEquipe(state, d.equipeId))})${UI().esc(
            extra
          )}</option>`;
        })
        .join("");
      updateDica();
    };

    const updateDica = () => {
      const part = m.querySelector("#t-part").value;
      const paraId = m.querySelector("#t-com").value;
      const dica = m.querySelector("#t-dica");
      const mod = modalidade();
      if (!part || !paraId) {
        dica.textContent = "";
        return;
      }
      const [data] = part.split("|");
      const ja = funcaoDoDiaconoNaData(state, paraId, data);
      const nomeB = UI().nomeDiacono(state, paraId);
      if (mod === "cobertura") {
        dica.textContent = ja
          ? `${nomeB} cobrirá a função e deixará a própria escala deste dia.`
          : `${nomeB} (outra ou mesma equipe) cobrirá; quem saiu fica fora deste dia.`;
      } else if (ja) {
        dica.textContent = `${nomeB} já serve neste dia — as funções serão trocadas.`;
      } else {
        dica.textContent = `${nomeB} assume a função e quem sai fica fora desta escala.`;
      }
    };

    const fillSlots = () => {
      const msel = +m.querySelector("#t-mes").value;
      const slots = slotsTrocaDoMes(state, ano, msel);
      const part = m.querySelector("#t-part");
      part.innerHTML = optionsSlotsTroca(state, slots);
      if (!slots.length) {
        UI().toast("Não há atribuições neste mês.");
      }
      fillCom();
    };

    m.querySelectorAll('input[name="t-mod"]').forEach((r) => r.addEventListener("change", updateDica));
    m.querySelector("#t-mes").addEventListener("change", fillSlots);
    m.querySelector("#t-part").addEventListener("change", fillCom);
    m.querySelector("#t-com").addEventListener("change", updateDica);
    fillCom();

    m.addEventListener("click", (e) => {
      const act = e.target.closest("[data-act]")?.dataset.act;
      if (act === "cancel") return UI().closeModal();
      if (act !== "apply") return;
      const part = m.querySelector("#t-part").value;
      const paraDiaconoId = m.querySelector("#t-com").value;
      if (!part || !paraDiaconoId) return UI().toast("Selecione quem sai e quem entra/cobre.");
      const [data, equipeId, funcaoId, deDiaconoId] = part.split("|");
      const res = window.DiaconiaSwaps.executarPeloLider(
        state,
        {
          data,
          equipeId,
          funcaoId,
          deDiaconoId,
          paraDiaconoId,
          modalidade: modalidade(),
        },
        ctx(app).sessao()
      );
      if (!res.ok) return UI().toast(res.erro);
      app.save();
      UI().closeModal();
      app.render();
      UI().toast(modalidade() === "cobertura" ? "Cobertura registrada." : "Troca registrada.");
    });
  }

  /* ——— Usuários ——— */
  function usuarios(app) {
    const { state } = ctx(app);
    const sessao = ctx(app).sessao();
    const rows = (state.usuarios || [])
      .map((u) => {
        const papelLabel = u.papel === "lider" ? "Liderança" : "Diácono";
        const wa = whatsappDoUsuario(state, u);
        const perfil = u.diaconoId ? state.diaconos.find((d) => d.id === u.diaconoId) : null;
        const statusCell = perfil
          ? UI().badgeAtivo(perfil.ativo)
          : `<span class="badge badge-muted" title="Sem perfil na escala">—</span>`;
        const perfilCell = perfil
          ? `<span class="badge badge-ok" title="Configure em Diáconos">Na escala</span>`
          : u.papel === "lider"
            ? `<span class="badge badge-muted" title="Marque Entrar na escala na edição">Fora da escala</span>`
            : `<span class="badge badge-muted">—</span>`;
        const waBadge = window.DiaconiaWhatsApp?.numeroValido?.(wa)
          ? `<span class="badge badge-ok" title="${UI().esc(wa)}">WA</span>`
          : `<span class="badge badge-muted" title="Sem WhatsApp">—</span>`;
        return `<tr class="no-click">
        ${UI().bulkTd(u.id, "usuarios", { disabled: sessao?.usuarioId === u.id })}
        <td>${statusCell}</td>
        <td><strong>${UI().esc(u.nome)}</strong></td>
        <td><code>${UI().esc(u.login)}</code></td>
        <td><span class="badge badge-${u.papel === "lider" ? "ok" : "muted"}">${UI().esc(papelLabel)}</span></td>
        <td>${perfilCell}</td>
        <td>${waBadge}</td>
        <td>
          <div class="toolbar">
            ${UI().btnIcon({ icon: "pencil", label: "Editar", variant: "ghost", attrs: { "data-act": "edit-u", "data-id": u.id } })}
            ${UI().btnIcon({
              icon: "trash",
              label: sessao?.usuarioId === u.id ? "Não pode excluir a si mesmo" : "Excluir",
              variant: "danger",
              attrs: { "data-act": "del-u", "data-id": u.id },
              disabled: sessao?.usuarioId === u.id,
            })}
          </div>
        </td>
      </tr>`;
      })
      .join("");
    return `
      <div class="topbar">
        <div>
          <h1>Usuários</h1>
          <p class="sub">Contas de acesso. Diáconos e líderes com “Entrar na escala” aparecem em Diáconos para equipe e funções.</p>
        </div>
        <button type="button" class="btn btn-accent" id="btn-add-u">+ Adicionar usuário</button>
      </div>
      <div class="panel">${UI().bulkBar("usuarios")}<div class="table-wrap"><table class="data" data-bulk-table="usuarios">
        <thead><tr>${UI().bulkTh("usuarios")}<th>Status</th><th>Nome</th><th>Login</th><th>Papel</th><th>Perfil</th><th>WA</th><th>Ações</th></tr></thead>
        <tbody>${rows || `<tr class="no-click"><td colspan="8" class="empty">Nenhum usuário.</td></tr>`}</tbody>
      </table></div></div>`;
  }

  function bindUsuarios(app, root) {
    const { state } = ctx(app);
    root.querySelector("#btn-add-u")?.addEventListener("click", () => formUsuario(app, null));
    root.querySelectorAll('[data-act="edit-u"]').forEach((btn) => {
      btn.addEventListener("click", () => {
        const u = state.usuarios.find((x) => x.id === btn.dataset.id);
        formUsuario(app, u);
      });
    });
    root.querySelectorAll('[data-act="del-u"]').forEach((btn) => {
      btn.addEventListener("click", async () => {
        const u = state.usuarios.find((x) => x.id === btn.dataset.id);
        if (!u) return;
        if (ctx(app).sessao()?.usuarioId === u.id) {
          return UI().toast("Você não pode excluir o usuário com o qual está logado.");
        }
        const ok = await UI().confirmDelete({
          itemLabel: `o usuário <strong>${UI().esc(u.nome)}</strong> (${UI().esc(u.login)})`,
          detalhes: "A pessoa não conseguirá mais entrar com este login.",
        });
        if (!ok) return;
        if (u.diaconoId) removerDiaconoDoEstado(state, u.diaconoId);
        else {
          removerLiderDeUsuario(state, u.id);
          state.usuarios = state.usuarios.filter((x) => x.id !== u.id);
        }
        window.DiaconiaHistory.add(state, {
          tipo: "usuario",
          mensagem: `Usuário excluído: ${u.login}.`,
          usuarioId: ctx(app).sessao()?.usuarioId,
        });
        app.save();
        app.render();
        UI().toast("Usuário excluído.");
      });
    });

    UI().bindBulkTable(root, "usuarios", {
      itemLabel: "usuário(s)",
      onDelete: async (ids) => {
        const me = ctx(app).sessao()?.usuarioId;
        const okIds = ids.filter((id) => id !== me);
        if (!okIds.length) return UI().toast("Não é possível excluir o usuário logado.");
        for (const id of okIds) {
          const u = state.usuarios.find((x) => x.id === id);
          if (!u) continue;
          if (u.diaconoId) removerDiaconoDoEstado(state, u.diaconoId);
          else removerLiderDeUsuario(state, id);
        }
        state.usuarios = (state.usuarios || []).filter((u) => !okIds.includes(u.id));
        window.DiaconiaHistory.add(state, {
          tipo: "usuario",
          mensagem: `${okIds.length} usuário(s) excluído(s) em massa.`,
          usuarioId: me,
        });
        app.save();
        app.render();
        UI().toast(`${okIds.length} usuário(s) excluído(s).`);
      },
    });
  }

  function formUsuario(app, usuario = null) {
    const { state } = ctx(app);
    const waInicial = whatsappDoUsuario(state, usuario);
    const jaNaEscala = !!(usuario?.diaconoId && state.diaconos.some((d) => d.id === usuario.diaconoId));
    UI().openModal(`
      <h2>${usuario ? "Editar usuário" : "Adicionar usuário"}</h2>
      <label class="field"><span>Nome</span><input id="u-nome" value="${UI().esc(usuario?.nome || "")}"/></label>
      <label class="field"><span>Login</span><input id="u-login" value="${UI().esc(usuario?.login || "")}" autocomplete="off"/></label>
      <label class="field"><span>WhatsApp (DD)</span>
        <input id="u-whatsapp" inputmode="tel" value="${UI().esc(waInicial)}" placeholder="Ex.: 47999990000"/>
      </label>
      <p class="muted" style="font-size:12px;margin:-6px 0 12px" id="u-wa-hint">${usuario ? "Usado para contato e compartilhar login/senha." : "Ao criar, abriremos o WhatsApp com login e senha (se o número estiver preenchido)."}</p>
      <label class="field"><span>Senha</span>
        ${UI().passwordFieldHtml({
          id: "u-senha",
          value: usuario?.senha || "",
          placeholder: usuario ? "Sem senha definida" : "Defina uma senha",
          extraAttrs: { autocomplete: "new-password" },
        })}
      </label>
      ${
        usuario?.senha
          ? `<p class="muted" style="font-size:12px;margin:-6px 0 12px">Senha salva no cadastro. Clique no ícone do olho para visualizar.</p>`
          : usuario
            ? `<p class="muted" style="font-size:12px;margin:-6px 0 12px">Nenhuma senha cadastrada — defina uma abaixo.</p>`
            : ""
      }
      <label class="field"><span>Papel</span>
        <select id="u-papel" class="select">
          <option value="lider" ${usuario?.papel === "lider" ? "selected" : ""}>Liderança</option>
          <option value="diacono" ${!usuario || usuario?.papel === "diacono" ? "selected" : ""}>Diácono</option>
        </select>
      </label>
      <p class="muted" style="font-size:12px;margin:-6px 0 8px" id="u-papel-hint">Diácono: o perfil no cadastro é criado automaticamente. Equipe, funções e demais dados se ajustam depois em Diáconos.</p>
      <div id="u-wrap-escala" style="display:none">
        <label class="field"><span><input type="checkbox" id="u-entrar-escala" ${jaNaEscala ? "checked" : ""}/> Entrar na escala</span></label>
        <p class="muted" style="font-size:12px;margin:-8px 0 12px">Marcado = o líder recebe perfil em <strong>Diáconos</strong> e pode ser escalado (defina equipe e funções lá). Desmarcado = só gestão, sem escala.</p>
      </div>
      ${
        usuario
          ? `<button type="button" class="btn btn-ghost btn-block" data-act="share-wa" style="margin-top:4px">📲 Compartilhar login e senha no WhatsApp</button>`
          : ""
      }
      <div class="modal-actions">
        <button type="button" class="btn btn-ghost" data-act="cancel">Cancelar</button>
        <button type="button" class="btn btn-accent" data-act="save">Salvar</button>
      </div>
    `);
    const m = document.getElementById("modal-root");
    UI().bindPasswordToggles(m);
    const senhaInput = m.querySelector("#u-senha");
    if (senhaInput && usuario?.senha) senhaInput.value = usuario.senha;
    const syncPapel = () => {
      const lider = m.querySelector("#u-papel").value === "lider";
      const hint = m.querySelector("#u-wa-hint");
      const papelHint = m.querySelector("#u-papel-hint");
      const wrapEscala = m.querySelector("#u-wrap-escala");
      if (wrapEscala) wrapEscala.style.display = lider ? "" : "none";
      if (papelHint) {
        papelHint.textContent = lider
          ? "Liderança: acesso ao painel de gestão. Marque “Entrar na escala” se também for servir nos cultos."
          : "Diácono: o perfil no cadastro é criado automaticamente. Equipe, funções e demais dados se ajustam depois em Diáconos.";
      }
      if (hint && usuario) {
        hint.textContent = lider
          ? "Liderança: o número aparece em Falar com um líder na conta de cada diácono. Use o botão abaixo para reenviar login e senha."
          : "Diácono: use o botão abaixo para reenviar login e senha pelo WhatsApp.";
      }
    };
    m.querySelector("#u-papel")?.addEventListener("change", syncPapel);
    syncPapel();

    m.addEventListener("click", async (e) => {
      const act = e.target.closest("[data-act]")?.dataset.act;
      if (act === "cancel") return UI().closeModal();
      if (act === "share-wa") {
        if (!usuario) return;
        const nomeShare = m.querySelector("#u-nome").value.trim() || usuario.nome;
        let loginShare = m.querySelector("#u-login").value.trim().toLowerCase().replace(/\s+/g, "");
        if (!loginShare) loginShare = usuario.login;
        const senhaCampo = m.querySelector("#u-senha").value;
        const senhaShare = senhaCampo || usuario.senha;
        const papelShare = m.querySelector("#u-papel").value;
        const whatsappShare = waDigits(m.querySelector("#u-whatsapp")?.value);
        if (!senhaShare) return UI().toast("Não há senha para compartilhar.");
        if (whatsappShare && !window.DiaconiaWhatsApp?.numeroValido?.(whatsappShare)) {
          return UI().toast("WhatsApp inválido. Use DD + número (ex.: 47997845287).");
        }
        const snapshot = {
          ...usuario,
          nome: nomeShare,
          login: loginShare,
          papel: papelShare,
          whatsapp: whatsappShare,
          senha: senhaShare,
        };
        syncDiaconoWhatsappDoUsuario(state, snapshot, whatsappShare);
        syncLiderDeUsuario(state, snapshot, whatsappShare);
        const wa = compartilharCredenciaisUsuarioApp(app, snapshot, senhaShare);
        if (!wa?.ok && wa) return;
        return;
      }
      if (act !== "save") return;
      const nome = m.querySelector("#u-nome").value.trim();
      let login = m.querySelector("#u-login").value.trim().toLowerCase().replace(/\s+/g, "");
      const senha = m.querySelector("#u-senha").value;
      const papel = m.querySelector("#u-papel").value;
      const whatsapp = waDigits(m.querySelector("#u-whatsapp")?.value);
      const entrarNaEscala =
        papel === "diacono" || !!m.querySelector("#u-entrar-escala")?.checked;
      const logId = ctx(app).sessao()?.usuarioId;
      if (whatsapp && !window.DiaconiaWhatsApp?.numeroValido?.(whatsapp)) {
        return UI().toast("WhatsApp inválido. Use DD + número (ex.: 47997845287).");
      }
      if (!nome) return UI().toast("Informe o nome.");
      if (!login) login = loginUnico(state, nome, usuario?.id);
      if ((state.usuarios || []).some((u) => u.login.toLowerCase() === login && u.id !== usuario?.id)) {
        return UI().toast("Este login já existe. Escolha outro.");
      }
      if (!usuario && !senha) return UI().toast("Defina uma senha.");

      let waCadastro = null;
      if (usuario) {
        usuario.nome = nome;
        usuario.login = login;
        usuario.papel = papel;
        if (senha) {
          usuario.senha = senha;
        } else if (!usuario.senha) {
          return UI().toast("Defina uma senha para este usuário.");
        }
        window.DiaconiaStorage.touchUsuario?.(usuario);
        if (papel === "lider") {
          syncLiderDeUsuario(state, usuario, whatsapp);
        } else {
          removerLiderDeUsuario(state, usuario.id);
        }
        garantirPerfilDiacono(state, usuario, { nome, whatsapp, entrarNaEscala }, logId);
        syncDiaconoWhatsappDoUsuario(state, usuario, whatsapp);
        if (ctx(app).sessao()?.usuarioId === usuario.id) {
          window.DiaconiaAuth.atualizarSessao({
            nome: usuario.nome,
            papel: usuario.papel,
            diaconoId: usuario.diaconoId || null,
          });
        }
        window.DiaconiaHistory.add(state, {
          tipo: "usuario",
          mensagem: `Usuário atualizado: ${login}.`,
          usuarioId: ctx(app).sessao()?.usuarioId,
        });
      } else {
        const novo = {
          id: Engine().uid("u"),
          nome,
          login,
          senha,
          papel,
          diaconoId: null,
          whatsapp,
        };
        if (papel === "lider") {
          syncLiderDeUsuario(state, novo, whatsapp);
        }
        garantirPerfilDiacono(state, novo, { nome, whatsapp, entrarNaEscala }, logId);
        syncDiaconoWhatsappDoUsuario(state, novo, whatsapp);
        state.usuarios.push(novo);
        window.DiaconiaStorage.touchUsuario?.(novo);
        window.DiaconiaHistory.add(state, {
          tipo: "usuario",
          mensagem: `Usuário criado: ${login} (${papel}).`,
          usuarioId: ctx(app).sessao()?.usuarioId,
        });
        waCadastro = window.DiaconiaWhatsApp?.notificarCadastroUsuario?.(state, novo, { senha });
      }
      const sync = await app.saveAndSync();
      UI().closeModal();
      app.render();
      if (senha && sync?.ok) {
        UI().toast("Usuário salvo e sincronizado no servidor.");
      } else if (senha && !sync?.ok) {
        UI().toast("Salvo neste aparelho — não confirmou no servidor. Tente salvar de novo.");
      } else {
        UI().toast("Usuário salvo.");
      }
      if (waCadastro) toastWhatsappCadastro(waCadastro);
    });
  }

  /* ——— Histórico ——— */
  function historico(app) {
    const { state } = ctx(app);
    const filtro = app.filtroHistoricoTipo || "";
    const busca = (app.filtroHistoricoBusca || "").toLowerCase().trim();
    let lista = state.historico || [];
    const tipos = [...new Set(lista.map((h) => h.tipo).filter(Boolean))].sort();
    if (filtro) lista = lista.filter((h) => h.tipo === filtro);
    if (busca) {
      lista = lista.filter(
        (h) =>
          String(h.mensagem || "").toLowerCase().includes(busca) ||
          String(h.tipo || "").toLowerCase().includes(busca)
      );
    }
    const total = (state.historico || []).length;
    const rows = lista
      .slice(0, 200)
      .map(
        (h) => `<tr class="no-click">
        ${UI().bulkTd(h.id, "historico")}
        <td>${UI().esc(new Date(h.em).toLocaleString("pt-BR"))}</td>
        <td><span class="chip">${UI().esc(h.tipo)}</span></td>
        <td>${UI().esc(h.mensagem)}</td>
        <td class="toolbar">
          ${UI().btnIcon({ icon: "trash", label: "Excluir", variant: "danger", attrs: { "data-act": "del-h", "data-id": h.id } })}
        </td>
      </tr>`
      )
      .join("");

    const tipoOpts = tipos
      .map((t) => `<option value="${UI().esc(t)}" ${filtro === t ? "selected" : ""}>${UI().esc(t)}</option>`)
      .join("");

    return `
      <div class="topbar">
        <div>
          <h1>Histórico</h1>
          <p class="sub">${lista.length} registro(s) exibidos · ${total} no total. Criações, alterações, trocas e aprovações.</p>
        </div>
        <div class="toolbar">
          <button type="button" class="btn btn-danger" id="btn-clear-hist">Limpar tudo</button>
        </div>
      </div>
      <div class="toolbar" style="margin-bottom:14px">
        <label class="field" style="margin:0;min-width:160px">
          <span class="muted" style="font-size:12px">Tipo</span>
          <select id="hist-tipo" class="select">
            <option value="">Todos</option>
            ${tipoOpts}
          </select>
        </label>
        <label class="field" style="margin:0;flex:1;min-width:180px">
          <span class="muted" style="font-size:12px">Buscar</span>
          <input id="hist-busca" class="input" placeholder="Texto da mensagem…" value="${UI().esc(app.filtroHistoricoBusca || "")}"/>
        </label>
      </div>
      <div class="panel">${UI().bulkBar("historico")}<div class="table-wrap"><table class="data" data-bulk-table="historico">
        <thead><tr>${UI().bulkTh("historico")}<th>Quando</th><th>Tipo</th><th>Mensagem</th><th>Ações</th></tr></thead>
        <tbody>${rows || `<tr class="no-click"><td colspan="5" class="empty">Nenhum registro neste filtro.</td></tr>`}</tbody>
      </table></div></div>`;
  }

  function bindHistorico(app, root) {
    const { state } = ctx(app);
    root.querySelector("#hist-tipo")?.addEventListener("change", (e) => {
      app.filtroHistoricoTipo = e.target.value;
      app.render();
    });
    let timer;
    root.querySelector("#hist-busca")?.addEventListener("input", (e) => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        app.filtroHistoricoBusca = e.target.value;
        app.render();
        const el = document.querySelector("#hist-busca");
        if (el) {
          el.focus();
          const len = el.value.length;
          el.setSelectionRange(len, len);
        }
      }, 200);
    });
    root.querySelectorAll('[data-act="del-h"]').forEach((btn) => {
      btn.addEventListener("click", async () => {
        const ok = await UI().confirmDelete({
          itemLabel: "este registro do histórico",
        });
        if (!ok) return;
        window.DiaconiaHistory.remove(state, btn.dataset.id);
        app.save();
        app.render();
        UI().toast("Registro excluído.");
      });
    });
    root.querySelector("#btn-clear-hist")?.addEventListener("click", async () => {
      const ok = await UI().confirmModal({
        title: "Limpar histórico",
        body: "<p>Apagar <strong>todos</strong> os registros do histórico?</p>",
        okText: "Limpar tudo",
        danger: true,
      });
      if (!ok) return;
      window.DiaconiaHistory.clear(state);
      app.save();
      app.render();
      UI().toast("Histórico limpo.");
    });

    UI().bindBulkTable(root, "historico", {
      itemLabel: "registro(s)",
      onDelete: async (ids) => {
        const set = new Set(ids);
        state.historico = (state.historico || []).filter((h) => !set.has(h.id));
        app.save();
        app.render();
        UI().toast(`${ids.length} registro(s) excluído(s).`);
      },
    });
  }

  /* ——— Configurações ——— */
  function configuracoes(app) {
    const { state } = ctx(app);
    const cfg = state.configuracoes || {};
    const lideres = (state.lideres || [])
      .map(
        (l) => `
        <div class="panel lider-card" data-lid="${l.id}">
          <div class="panel-head">
            <h3>${UI().esc(l.nome || "Líder")}${l.usuarioId ? ` <span class="muted" style="font-size:12px;font-weight:400">· conta vinculada</span>` : ""}</h3>
            <button type="button" class="btn btn-danger btn-sm btn-icon" data-act="del-lider" data-id="${l.id}" title="Excluir" aria-label="Excluir">${UI().icon("trash")}</button>
          </div>
          <label class="field"><span>Nome</span><input data-l="nome" data-id="${l.id}" value="${UI().esc(l.nome || "")}"/></label>
          <label class="field"><span>WhatsApp (DD)</span>
            <input data-l="whatsapp" data-id="${l.id}" value="${UI().esc(l.whatsapp || "")}" placeholder="Ex.: 47999990000"/>
          </label>
          <label class="field"><span><input type="checkbox" data-l="ativo" data-id="${l.id}" ${l.ativo !== false ? "checked" : ""}/> Visível em Minha conta (Falar com um líder)</span></label>
          <label class="field"><span><input type="checkbox" data-l="apareceEmDiaconos" data-id="${l.id}" ${l.apareceEmDiaconos !== false ? "checked" : ""}/> Aparece na aba Diáconos</span></label>
          <p class="muted" style="font-size:12px;margin:-8px 0 0">Só vale se o líder estiver na escala (Usuários → Entrar na escala). Não afeta a geração da escala.</p>
        </div>`
      )
      .join("");

    const qLideres = (state.lideres || []).length;
    const qLideresAtivos = lideresAtivos(state).length;

    const qEscalas = Object.keys(state.escalas || {}).length;
    const qDiaconos = (state.diaconos || []).length;
    const ger = Engine().cfgGeracao(state);
    const wa = window.DiaconiaWhatsApp?.ensure?.(state) || state.configuracoes?.whatsapp || {};
    const waResumo = window.DiaconiaWhatsApp?.resumoCadastro?.(state) || {
      total: qDiaconos,
      comWhatsapp: 0,
      semWhatsapp: qDiaconos,
    };
    const filaPend = (state.whatsappFila || []).filter((x) => x.status === "pendente" || x.status === "erro").length;

    return `
      <div class="topbar"><div><h1>Configurações</h1><p class="sub">Igreja, regras de geração, WhatsApp, líderes e backup.</p></div></div>
      <div class="grid grid-2">
        <div class="panel">
          <h2>Geral</h2>
          <label class="field"><span>Nome da igreja</span><input id="cfg-igreja" value="${UI().esc(cfg.nomeIgreja || "")}"/></label>
          <label class="field"><span>Horário padrão</span><input id="cfg-hora" value="${UI().esc(cfg.horarioPadrao || "18:00")}"/></label>
          <label class="field"><span><input type="checkbox" id="cfg-rest" ${cfg.exigirAprovacaoRestricao !== false ? "checked" : ""}/> Exigir aprovação de restrições</span></label>
          <label class="field"><span><input type="checkbox" id="cfg-casais" ${cfg.respeitarCasais !== false ? "checked" : ""}/> Respeitar preferências de casais ao gerar escala</span></label>
          <p class="muted" style="font-size:13px;margin:0 0 12px">Modelo atual: <strong>1 equipe por dia</strong> (ex.: domingo X = Equipe 01, próximo = Equipe 02).</p>
          <button type="button" class="btn btn-accent" id="btn-save-cfg">Salvar</button>
          <button type="button" class="btn btn-danger" id="btn-reset" style="margin-left:8px">Resetar dados demo</button>
        </div>
        <div>
          <div class="panel-head" style="margin-bottom:12px">
            <div>
              <h2 style="margin:0">Líderes (WhatsApp)</h2>
              <p class="muted" style="font-size:13px;margin:4px 0 0"><strong>${qLideres}</strong> cadastrado(s) · <strong>${qLideresAtivos}</strong> visível(is) em Minha conta · marque “Aparece na aba Diáconos” por líder</p>
            </div>
            <button type="button" class="btn btn-accent btn-sm" id="btn-add-lider">+ Adicionar líder</button>
          </div>
          <div class="grid" id="lista-lideres">${lideres || `<p class="muted">Nenhum líder cadastrado.</p>`}</div>
          <p class="muted" style="font-size:12px;margin:10px 0 0">Contas com papel Liderança em Usuários entram aqui automaticamente. Alterações refletem na hora para os diáconos.</p>
          <button type="button" class="btn btn-primary" id="btn-save-lideres" style="margin-top:12px">Salvar líderes</button>
        </div>
      </div>

      <div class="panel" style="margin-top:16px">
        <h2>WhatsApp (avisos e trocas)</h2>
        <p class="muted" style="margin-top:-4px">
          Hoje: modo <strong>manual</strong> (no PC pergunta se usa o <strong>app instalado</strong> ou o <strong>WhatsApp Web</strong>).
          Futuro: modo <strong>API</strong> envia pelo servidor sem intervenção.
        </p>
        <p class="muted" style="font-size:13px">
          Diáconos com WhatsApp: <strong>${waResumo.comWhatsapp}</strong> de ${waResumo.total}
          ${waResumo.semWhatsapp ? ` · <span style="color:var(--warn)">${waResumo.semWhatsapp} sem número</span>` : ""}
          ${filaPend ? ` · fila pendente: ${filaPend}` : ""}
        </p>
        <div class="grid grid-2" style="margin-top:12px">
          <div>
            <label class="field"><span><input type="checkbox" id="wa-ativo" ${wa.ativo !== false ? "checked" : ""}/> Canal WhatsApp ativo</span></label>
            <label class="field"><span><input type="checkbox" id="wa-troca" ${wa.notificarPedidoTroca !== false ? "checked" : ""}/> Avisar quem recebe pedido de troca/cobertura</span></label>
            <label class="field"><span><input type="checkbox" id="wa-troca-resp" ${wa.notificarRespostaTroca !== false ? "checked" : ""}/> Avisar quem pediu quando aceitarem ou recusarem</span></label>
            <label class="field"><span><input type="checkbox" id="wa-cadastro" ${wa.notificarCadastroUsuario !== false ? "checked" : ""}/> Enviar login e senha ao criar usuário</span></label>
            <label class="field"><span><input type="checkbox" id="wa-rest" ${wa.notificarRestricao !== false ? "checked" : ""}/> Avisar líderes quando diácono enviar “Não posso ir”</span></label>
            <label class="field"><span><input type="checkbox" id="wa-rest-st" ${wa.notificarStatusRestricao !== false ? "checked" : ""}/> Avisar diácono quando líder aprovar ou recusar aviso</span></label>
            <label class="field"><span><input type="checkbox" id="wa-direto" ${wa.abrirDireto ? "checked" : ""}/> No celular, abrir conversa direto no app</span></label>
            <p class="muted" style="font-size:12px;margin:-8px 0 12px">No computador o sistema sempre pergunta: app instalado (desta máquina) ou WhatsApp Web.</p>
            <label class="field"><span>Modo de envio</span>
              <select id="wa-modo" class="select">
                <option value="manual" ${wa.modo !== "api" ? "selected" : ""}>Manual (wa.me) — atual</option>
                <option value="api" ${wa.modo === "api" ? "selected" : ""}>API (servidor) — futuro</option>
              </select>
            </label>
          </div>
          <div>
            <label class="field"><span>URL pública do portal (opcional)</span>
              <input id="wa-portal" class="input" value="${UI().esc(wa.portalBaseUrl || "")}" placeholder="Ex.: https://suaigreja.com/diaconia/"/>
            </label>
            <p class="muted" style="font-size:12px;margin:-8px 0 12px">Usada no link enviado. Vazia = URL atual do navegador.</p>
            <label class="field"><span>API URL (futuro)</span>
              <input id="wa-api-url" class="input" value="${UI().esc(wa.apiUrl || "")}" placeholder="https://seu-servidor/api/whatsapp/send"/>
            </label>
            <label class="field"><span>API Token (futuro)</span>
              <input id="wa-api-token" class="input" type="password" value="${UI().esc(wa.apiToken || "")}" placeholder="Será melhor guardar no servidor"/>
            </label>
          </div>
        </div>
        <div class="toolbar" style="margin-top:8px">
          <button type="button" class="btn btn-accent" id="btn-save-wa">Salvar WhatsApp</button>
          <button type="button" class="btn btn-ghost" id="btn-wa-fila">Processar fila API</button>
        </div>
      </div>

      <div class="panel" style="margin-top:16px">
        <h2>Regras de geração da escala</h2>
        <p class="muted" style="margin-top:-4px">Essas opções valem sempre que você gerar a escala (por mês ou por período) ou um dia.</p>
        <div class="grid grid-2" style="margin-top:12px">
          <div>
            <label class="field"><span><input type="checkbox" id="cfg-var-fn" ${ger.variarFuncoesNoMes !== false ? "checked" : ""}/> Variar funções no mês</span></label>
            <p class="muted" style="font-size:12px;margin:-8px 0 12px">Evita que a mesma pessoa fique sempre na mesma função ao longo do mês.</p>
            <label class="field"><span><input type="checkbox" id="cfg-evita-seq" ${ger.evitarMesmaFuncaoConsecutiva !== false ? "checked" : ""}/> Evitar repetir a mesma função em seguida</span></label>
            <p class="muted" style="font-size:12px;margin:-8px 0 12px">Quem fez Louça no último culto tende a não fazer Louça de novo no próximo.</p>
            <label class="field"><span><input type="checkbox" id="cfg-emb-fn" ${ger.embaralharOrdemFuncoes !== false ? "checked" : ""}/> Embaralhar ordem das funções a cada geração</span></label>
            <p class="muted" style="font-size:12px;margin:-8px 0 12px">Cada geração começa preenchendo as funções em ordem diferente.</p>
            <label class="field"><span><input type="checkbox" id="cfg-eq-part" ${ger.equilibrarParticipacao !== false ? "checked" : ""}/> Equilibrar participação geral</span></label>
            <p class="muted" style="font-size:12px;margin:-8px 0 12px">Prioriza quem serviu menos vezes no histórico.</p>
          </div>
          <div>
            <label class="field"><span>Máx. escalas por diácono no mês</span>
              <input type="number" id="cfg-max-mes" class="input" min="0" step="1" value="${UI().esc(String(ger.maxEscalasPorDiaconoNoMes ?? 0))}"/>
            </label>
            <p class="muted" style="font-size:12px;margin:-8px 0 12px">0 = sem limite. Ex.: 2 = no máximo duas escalas no mês por pessoa.</p>
            <label class="field"><span>Máx. pessoas por culto</span>
              <input type="number" id="cfg-max-culto" class="input" min="0" step="1" value="${UI().esc(String(ger.maxPessoasPorCulto ?? 0))}"/>
            </label>
            <p class="muted" style="font-size:12px;margin:-8px 0 12px">0 = preenche todas as vagas das funções. Útil para limitar o tamanho da escala do culto.</p>
            <label class="field"><span>Máx. pessoas por evento</span>
              <input type="number" id="cfg-max-evento" class="input" min="0" step="1" value="${UI().esc(String(ger.maxPessoasPorEvento ?? 0))}"/>
            </label>
            <p class="muted" style="font-size:12px;margin:-8px 0 12px">Mesma ideia, para escalas do tipo Evento.</p>
          </div>
        </div>
        <button type="button" class="btn btn-accent" id="btn-save-geracao">Salvar regras de geração</button>
      </div>

      <div class="panel" style="margin-top:16px">
        <div class="panel-head">
          <div>
            <h2>Backup e restauração</h2>
            <p class="muted" style="margin:0">Salve um arquivo JSON com escalas, diáconos, restrições, trocas e configurações.</p>
          </div>
        </div>
        <div class="chips" style="margin:12px 0 16px">
          <span class="chip">${qEscalas} escalas</span>
          <span class="chip">${qDiaconos} diáconos</span>
          <span class="chip">${(state.restricoes || []).length} restrições</span>
          <span class="chip">${(state.trocas || []).length} trocas</span>
        </div>
        <div class="toolbar">
          <button type="button" class="btn btn-primary" id="btn-backup-export">Baixar backup</button>
          <button type="button" class="btn btn-accent" id="btn-backup-import">Restaurar backup</button>
          <input type="file" id="backup-file" accept=".json,application/json" class="hidden"/>
        </div>
        <div class="alert alert-info" style="margin-top:14px">
          <strong>Dica:</strong> faça backup antes de gerar o ano ou após aprovar restrições/trocas.
          A restauração <strong>substitui todos os dados atuais</strong> pelos do arquivo.
        </div>
      </div>`;
  }

  function bindConfiguracoes(app, root) {
    const { state } = ctx(app);
    if (!state.lideres) state.lideres = [];
    if (!state.configuracoes.geracao) state.configuracoes.geracao = {};

    function salvarGeracao() {
      const g = state.configuracoes.geracao;
      g.variarFuncoesNoMes = root.querySelector("#cfg-var-fn").checked;
      g.evitarMesmaFuncaoConsecutiva = root.querySelector("#cfg-evita-seq").checked;
      g.embaralharOrdemFuncoes = root.querySelector("#cfg-emb-fn").checked;
      g.equilibrarParticipacao = root.querySelector("#cfg-eq-part").checked;
      g.maxEscalasPorDiaconoNoMes = Math.max(0, +root.querySelector("#cfg-max-mes").value || 0);
      g.maxPessoasPorCulto = Math.max(0, +root.querySelector("#cfg-max-culto").value || 0);
      g.maxPessoasPorEvento = Math.max(0, +root.querySelector("#cfg-max-evento").value || 0);
    }

    root.querySelector("#btn-save-cfg")?.addEventListener("click", () => {
      state.configuracoes.nomeIgreja = root.querySelector("#cfg-igreja").value;
      state.configuracoes.horarioPadrao = root.querySelector("#cfg-hora").value;
      state.configuracoes.exigirAprovacaoRestricao = root.querySelector("#cfg-rest").checked;
      state.configuracoes.exigirAprovacaoTroca = false;
      state.configuracoes.respeitarCasais = root.querySelector("#cfg-casais").checked;
      salvarGeracao();
      app.save();
      UI().toast("Configurações salvas.");
    });

    root.querySelector("#btn-save-geracao")?.addEventListener("click", () => {
      salvarGeracao();
      window.DiaconiaHistory.add(state, {
        tipo: "config",
        mensagem: "Regras de geração da escala atualizadas.",
        usuarioId: ctx(app).sessao()?.usuarioId,
      });
      app.save();
      UI().toast("Regras de geração salvas.");
    });

    root.querySelector("#btn-save-wa")?.addEventListener("click", () => {
      window.DiaconiaWhatsApp?.ensure?.(state);
      state.configuracoes.whatsapp = {
        ...window.DiaconiaWhatsApp.cfgPadrao(),
        ...(state.configuracoes.whatsapp || {}),
        ativo: root.querySelector("#wa-ativo")?.checked !== false,
        notificarPedidoTroca: root.querySelector("#wa-troca")?.checked !== false,
        notificarRespostaTroca: root.querySelector("#wa-troca-resp")?.checked !== false,
        notificarCadastroUsuario: root.querySelector("#wa-cadastro")?.checked !== false,
        notificarRestricao: root.querySelector("#wa-rest")?.checked !== false,
        notificarStatusRestricao: root.querySelector("#wa-rest-st")?.checked !== false,
        abrirDireto: root.querySelector("#wa-direto")?.checked !== false,
        abrirNoNavegador: false,
        modo: root.querySelector("#wa-modo")?.value === "api" ? "api" : "manual",
        portalBaseUrl: root.querySelector("#wa-portal")?.value.trim() || "",
        apiUrl: root.querySelector("#wa-api-url")?.value.trim() || "",
        apiToken: root.querySelector("#wa-api-token")?.value.trim() || "",
      };
      window.DiaconiaHistory.add(state, {
        tipo: "config",
        mensagem: `Configuração WhatsApp salva (modo ${state.configuracoes.whatsapp.modo}).`,
        usuarioId: ctx(app).sessao()?.usuarioId,
      });
      app.save();
      app.render();
      UI().toast("Configurações de WhatsApp salvas.");
    });

    root.querySelector("#btn-wa-fila")?.addEventListener("click", async () => {
      if (!window.DiaconiaWhatsApp?.processarFila) return UI().toast("Serviço WhatsApp indisponível.");
      const res = await window.DiaconiaWhatsApp.processarFila(state);
      app.save();
      app.render();
      UI().toast(
        res.mensagem ||
          `Fila processada: ${res.processados || 0} de ${res.total || 0} enviado(s).`
      );
    });

    root.querySelector("#btn-add-lider")?.addEventListener("click", () => {
      state.lideres.push({
        id: Engine().uid("l"),
        nome: `Líder ${(state.lideres.length || 0) + 1}`,
        whatsapp: "",
        ativo: true,
        apareceEmDiaconos: true,
      });
      app.save();
      app.render();
      UI().toast("Líder adicionado. Preencha nome e WhatsApp e salve.");
    });

    root.querySelectorAll('[data-act="del-lider"]').forEach((btn) => {
      btn.addEventListener("click", async () => {
        const l = state.lideres.find((x) => x.id === btn.dataset.id);
        const ok = await UI().confirmDelete({
          itemLabel: `o líder <strong>${UI().esc(l?.nome || "")}</strong>`,
        });
        if (!ok) return;
        state.lideres = state.lideres.filter((x) => x.id !== btn.dataset.id);
        window.DiaconiaHistory.add(state, {
          tipo: "lider",
          mensagem: `Líder removido: ${l?.nome || btn.dataset.id}.`,
          usuarioId: ctx(app).sessao()?.usuarioId,
        });
        app.save();
        app.render();
        UI().toast("Líder excluído.");
      });
    });

    root.querySelector("#btn-save-lideres")?.addEventListener("click", () => {
      root.querySelectorAll("[data-l][data-id]").forEach((inp) => {
        const l = state.lideres.find((x) => x.id === inp.dataset.id);
        if (!l) return;
        if (inp.dataset.l === "ativo" || inp.dataset.l === "apareceEmDiaconos") l[inp.dataset.l] = inp.checked;
        else l[inp.dataset.l] = inp.value.trim();
      });
      for (const l of state.lideres || []) {
        if (!l.usuarioId) continue;
        const u = state.usuarios.find((x) => x.id === l.usuarioId);
        if (!u) continue;
        u.nome = l.nome;
        u.whatsapp = waDigits(l.whatsapp);
      }
      window.DiaconiaHistory.add(state, {
        tipo: "lider",
        mensagem: `Lista de líderes atualizada (${lideresAtivos(state).length} visível(is) para diáconos).`,
        usuarioId: ctx(app).sessao()?.usuarioId,
      });
      app.save();
      app.render();
      UI().toast("Líderes atualizados.");
    });

    root.querySelector("#btn-reset")?.addEventListener("click", async () => {
      const ok = await UI().confirmModal({
        title: "Resetar dados",
        body: "<p>Isso apaga o localStorage e reinstala o seed 2026.</p><p class=\"muted\">Recomendado: baixe um backup antes.</p>",
        okText: "Resetar",
        danger: true,
      });
      if (!ok) return;
      window.DiaconiaStorage.reset();
      app.state = window.DiaconiaStorage.getOrInit();
      app.save();
      app.render();
      UI().toast("Dados reiniciados.");
    });

    root.querySelector("#btn-backup-export")?.addEventListener("click", () => {
      app.save();
      const res = window.DiaconiaStorage.downloadBackup(app.state);
      if (res.ok) {
        window.DiaconiaHistory.add(app.state, {
          tipo: "backup",
          mensagem: `Backup exportado: ${res.nome}`,
          usuarioId: ctx(app).sessao()?.usuarioId,
        });
        app.save();
        UI().toast(`Backup baixado: ${res.nome}`);
      }
    });

    const fileInput = root.querySelector("#backup-file");
    root.querySelector("#btn-backup-import")?.addEventListener("click", () => fileInput?.click());

    fileInput?.addEventListener("change", async () => {
      const file = fileInput.files?.[0];
      fileInput.value = "";
      if (!file) return;

      let texto;
      try {
        texto = await window.DiaconiaStorage.readFileAsText(file);
      } catch {
        UI().toast("Não foi possível ler o arquivo.");
        return;
      }

      const parsed = window.DiaconiaStorage.parseBackup(texto);
      if (!parsed.ok) {
        UI().toast(parsed.erro);
        return;
      }

      const quando = parsed.meta.exportadoEm
        ? new Date(parsed.meta.exportadoEm).toLocaleString("pt-BR")
        : "data desconhecida";

      const ok = await UI().confirmModal({
        title: "Restaurar backup",
        body: `<p>Arquivo: <strong>${UI().esc(file.name)}</strong></p>
          <p>Exportado em: <strong>${UI().esc(quando)}</strong></p>
          <div class="alert alert-warn">Todos os dados atuais serão substituídos. Esta ação não pode ser desfeita (exceto com outro backup).</div>`,
        okText: "Restaurar agora",
        danger: true,
      });
      if (!ok) return;

      const restored = window.DiaconiaStorage.restoreBackup(parsed.state);
      if (!restored.ok) {
        UI().toast(restored.erro);
        return;
      }

      app.state = restored.state;
      window.DiaconiaHistory.add(app.state, {
        tipo: "backup",
        mensagem: `Backup restaurado a partir de ${file.name}.`,
        usuarioId: ctx(app).sessao()?.usuarioId,
      });
      app.save();
      app.ano = app.state.meta?.anoPadrao || 2026;
      app.mes = app.state.meta?.mesAtual || 8;
      app.render();
      UI().toast("Backup restaurado com sucesso.");
    });
  }

  const pages = {
    escalas: { render: escalas, bind: bindEscalas },
    diaconos: { render: diaconos, bind: bindDiaconos },
    equipes: { render: equipes, bind: bindEquipes },
    casais: { render: casais, bind: bindCasais },
    funcoes: { render: funcoes, bind: bindFuncoes },
    restricoes: { render: restricoes, bind: bindRestricoes },
    trocas: { render: trocas, bind: bindTrocas },
    usuarios: { render: usuarios, bind: bindUsuarios },
    historico: { render: historico, bind: bindHistorico },
    configuracoes: { render: configuracoes, bind: bindConfiguracoes },
  };

  return { pages };
})();
