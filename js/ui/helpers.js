window.DiaconiaUI = (() => {
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

  function esc(str) {
    return String(str ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function toast(msg, opts = {}) {
    let wrap = $("#toast-wrap");
    if (!wrap) {
      wrap = document.createElement("div");
      wrap.id = "toast-wrap";
      wrap.className = "toast-wrap";
      document.body.appendChild(wrap);
    }
    const el = document.createElement("div");
    el.className = "toast";
    const texto = String(msg ?? "");
    const podeRelatar =
      opts.relatar === true ||
      (/não (foi|foi possível|consegu|encontrad)|falh|inválid|erro|indisponív/i.test(texto) &&
        opts.relatar !== false);

    if (podeRelatar && typeof window.DiaconiaViewsDiacono?.abrirRelatarErro === "function") {
      el.innerHTML = `<span class="toast-msg"></span> <button type="button" class="toast-relatar">Relatar</button>`;
      el.querySelector(".toast-msg").textContent = texto;
      el.querySelector(".toast-relatar")?.addEventListener("click", (e) => {
        e.stopPropagation();
        const app = window.DiaconiaApp;
        if (!app) return;
        window.DiaconiaViewsDiacono.abrirRelatarErro(app, {
          titulo: texto.slice(0, 100),
          descricao: `Ao usar o sistema apareceu: “${texto}”.`,
          pagina: app.page || "",
          area: "outro",
        });
      });
    } else {
      el.textContent = texto;
    }
    wrap.appendChild(el);
    setTimeout(() => el.remove(), podeRelatar ? 5200 : 3200);
  }

  function badgeStatus(st) {
    const info = window.DiaconiaEngine.labelStatus(st);
    return `<span class="badge badge-${info.tom}"><span class="dot dot-${info.tom}"></span>${esc(info.texto)}</span>`;
  }

  /** Status de cadastro do diácono (escalável ou não). */
  function badgeAtivo(ativo) {
    if (ativo !== false) {
      return `<span class="badge badge-ok" title="Pode ser escalado"><span class="dot dot-ok"></span>Ativo</span>`;
    }
    return `<span class="badge badge-muted" title="Não entra na escala"><span class="dot dot-muted"></span>Inativo</span>`;
  }

  function openModal(html, { wide = false, onClose = null } = {}) {
    closeModal();
    const back = document.createElement("div");
    back.className = "modal-backdrop";
    back.id = "modal-root";
    back.innerHTML = `
      <div class="modal ${wide ? "wide" : ""}" role="dialog" aria-modal="true">
        <button type="button" class="modal-close" data-act="modal-close" title="Fechar" aria-label="Fechar">×</button>
        <div class="modal-body">${html}</div>
      </div>`;

    // Não fecha ao clicar fora — só pelo X, Cancelar ou Salvar
    back.querySelector(".modal-close")?.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      const cancelBtn = back.querySelector('[data-act="cancel"], [data-act="fechar"]');
      if (cancelBtn) {
        cancelBtn.click();
        return;
      }
      closeModal();
      onClose?.();
    });

    document.body.appendChild(back);
    return back;
  }

  function closeModal() {
    $("#modal-root")?.remove();
  }

  function confirmModal({ title, body, okText = "Confirmar", cancelText = "Cancelar", danger = false }) {
    return new Promise((resolve) => {
      let settled = false;
      const finish = (value) => {
        if (settled) return;
        settled = true;
        closeModal();
        resolve(value);
      };

      openModal(
        `
        <h2>${esc(title)}</h2>
        <div>${body}</div>
        <div class="modal-actions">
          <button class="btn btn-ghost" data-act="cancel">${esc(cancelText)}</button>
          <button class="btn ${danger ? "btn-danger" : "btn-accent"}" data-act="ok">${esc(okText)}</button>
        </div>
      `,
        { onClose: () => finish(false) }
      );

      const root = $("#modal-root");
      root.addEventListener("click", (e) => {
        const act = e.target.closest("[data-act]")?.dataset.act;
        if (act === "ok") finish(true);
        if (act === "cancel") finish(false);
      });
    });
  }

  /** Confirmação padrão para exclusões em todo o sistema */
  function confirmDelete({ itemLabel, detalhes = "" }) {
    const extra = detalhes ? `<div class="alert alert-warn">${detalhes}</div>` : "";
    return confirmModal({
      title: "Confirmar exclusão",
      body: `<p>Deseja realmente <strong>excluir</strong> ${itemLabel}?</p>
        <p class="muted">Esta ação não pode ser desfeita facilmente. Confirme apenas se tiver certeza.</p>
        ${extra}`,
      okText: "Sim, excluir",
      cancelText: "Cancelar",
      danger: true,
    });
  }

  function confirmDeleteBulk({ count, itemLabel = "item(ns)", detalhes = "" }) {
    const extra = detalhes ? `<div class="alert alert-warn">${detalhes}</div>` : "";
    const n = Number(count) || 0;
    const rotulo = n === 1 ? `1 ${itemLabel.replace(/\(s\)$/, "")}` : `${n} ${itemLabel}`;
    return confirmModal({
      title: "Excluir selecionados",
      body: `<p>Deseja realmente <strong>excluir</strong> ${rotulo}?</p>
        <p class="muted">Esta ação não pode ser desfeita facilmente.</p>
        ${extra}`,
      okText: n === 1 ? "Sim, excluir" : `Excluir ${n} itens`,
      cancelText: "Cancelar",
      danger: true,
    });
  }

  function bulkTh(tableId) {
    return `<th class="col-bulk"><input type="checkbox" class="bulk-all" data-bulk-all="${esc(tableId)}" aria-label="Selecionar todos" title="Selecionar todos"/></th>`;
  }

  function bulkTd(id, tableId, { disabled = false } = {}) {
    const dis = disabled ? " disabled" : "";
    return `<td class="col-bulk"><input type="checkbox" class="bulk-one" data-bulk-id="${esc(id)}" data-bulk-table="${esc(tableId)}" aria-label="Selecionar"${dis}/></td>`;
  }

  function bulkBar(tableId, { deleteLabel = "Excluir selecionados" } = {}) {
    return `<div class="bulk-bar hidden" data-bulk-bar="${esc(tableId)}">
      <span class="bulk-bar-count" data-bulk-count="${esc(tableId)}">0 selecionado(s)</span>
      <button type="button" class="btn btn-danger btn-sm" data-bulk-del="${esc(tableId)}" disabled>${esc(deleteLabel)}</button>
    </div>`;
  }

  function bindBulkTable(root, tableId, { onDelete, itemLabel = "item(ns)" }) {
    const table = root.querySelector(`table[data-bulk-table="${tableId}"]`);
    if (!table) return;

    const bar = root.querySelector(`[data-bulk-bar="${tableId}"]`);
    const countEl = root.querySelector(`[data-bulk-count="${tableId}"]`);
    const delBtn = root.querySelector(`[data-bulk-del="${tableId}"]`);
    const allCb = table.querySelector(`[data-bulk-all="${tableId}"]`);

    const getRows = () =>
      [...table.querySelectorAll(`.bulk-one[data-bulk-table="${tableId}"]:not(:disabled)`)];

    const selectedIds = () => getRows().filter((c) => c.checked).map((c) => c.dataset.bulkId);

    const refreshUI = () => {
      const ids = selectedIds();
      const n = ids.length;
      const total = getRows().length;
      bar?.classList.toggle("hidden", n === 0);
      if (countEl) countEl.textContent = n === 1 ? "1 selecionado" : `${n} selecionado(s)`;
      if (delBtn) delBtn.disabled = n === 0;
      if (allCb) {
        allCb.checked = n > 0 && n === total;
        allCb.indeterminate = n > 0 && n < total;
      }
    };

    table.addEventListener("change", (e) => {
      const t = e.target;
      if (t.matches(`[data-bulk-all="${tableId}"]`)) {
        const checked = t.checked;
        getRows().forEach((c) => {
          c.checked = checked;
        });
        refreshUI();
        return;
      }
      if (t.matches(`.bulk-one[data-bulk-table="${tableId}"]`)) refreshUI();
    });

    delBtn?.addEventListener("click", async () => {
      const ids = selectedIds();
      if (!ids.length) return;
      const ok = await confirmDeleteBulk({ count: ids.length, itemLabel });
      if (!ok) return;
      await onDelete(ids);
      refreshUI();
    });

    refreshUI();
  }

  function mesSelect(ano, mes) {
    const meses = window.DiaconiaCalendar.MESES.map(
      (n, i) => `<option value="${i + 1}" ${i + 1 === mes ? "selected" : ""}>${n}</option>`
    ).join("");
    const anos = [];
    for (let y = ano - 2; y <= ano + 3; y++) anos.push(y);
    const optsAno = anos
      .map((y) => `<option value="${y}" ${y === ano ? "selected" : ""}>${y}</option>`)
      .join("");
    return `
      <div class="mes-nav" role="group" aria-label="Navegação do mês">
        <button type="button" class="btn btn-ghost btn-mes-nav" id="btn-mes-prev" title="Mês anterior" aria-label="Mês anterior">‹</button>
        <label class="field" style="margin:0">
          <span class="muted" style="font-size:12px">Ano</span>
          <select class="select" id="sel-ano">${optsAno}</select>
        </label>
        <label class="field" style="margin:0">
          <span class="muted" style="font-size:12px">Mês</span>
          <select class="select" id="sel-mes">${meses}</select>
        </label>
        <button type="button" class="btn btn-ghost btn-mes-nav" id="btn-mes-next" title="Próximo mês" aria-label="Próximo mês">›</button>
      </div>
    `;
  }

  /** Liga selects e setas ‹ › do seletor de mês */
  function bindMesNav(app, root) {
    root.querySelector("#sel-ano")?.addEventListener("change", (e) => {
      app.setMes(+e.target.value, app.mes);
    });
    root.querySelector("#sel-mes")?.addEventListener("change", (e) => {
      app.setMes(app.ano, +e.target.value);
    });
    root.querySelector("#btn-mes-prev")?.addEventListener("click", () => {
      let ano = app.ano;
      let mes = app.mes - 1;
      if (mes < 1) {
        mes = 12;
        ano -= 1;
      }
      app.setMes(ano, mes);
    });
    root.querySelector("#btn-mes-next")?.addEventListener("click", () => {
      let ano = app.ano;
      let mes = app.mes + 1;
      if (mes > 12) {
        mes = 1;
        ano += 1;
      }
      app.setMes(ano, mes);
    });
  }

  function nomeDiacono(state, id) {
    return state.diaconos.find((d) => d.id === id)?.nome || "—";
  }

  function nomeEquipe(state, id) {
    return state.equipes.find((e) => e.id === id)?.nome || id || "—";
  }

  /** Nome da equipe só se a liderança definiu/confirmou o nome */
  function equipeNomeDefinido(state, id) {
    const eq = (state.equipes || []).find((e) => e.id === id);
    return !!(eq && eq.nomeDefinido && String(eq.nome || "").trim());
  }

  function nomeEquipePublico(state, id) {
    if (!equipeNomeDefinido(state, id)) return "";
    return nomeEquipe(state, id);
  }

  const CORES_EQUIPE_PADRAO = ["#0f4c5c", "#1d4e89", "#3d6b4f", "#6b3d5a", "#8a4a22", "#2f5d62"];

  function corEquipePadrao(idx) {
    const i = Number(idx);
    const n = CORES_EQUIPE_PADRAO.length;
    return CORES_EQUIPE_PADRAO[((Number.isFinite(i) ? i : 0) % n + n) % n];
  }

  function normalizarCorHex(v, fallback = "#0f4c5c") {
    const s = String(v || "").trim();
    if (/^#[0-9a-fA-F]{6}$/.test(s)) return `#${s.slice(1).toLowerCase()}`;
    if (/^#[0-9a-fA-F]{3}$/.test(s)) {
      const a = s.slice(1).toLowerCase();
      return `#${a[0]}${a[0]}${a[1]}${a[1]}${a[2]}${a[2]}`;
    }
    return fallback;
  }

  function corEquipe(state, id) {
    const eqs = state?.equipes || [];
    const idx = eqs.findIndex((e) => e.id === id);
    const fallback = corEquipePadrao(idx < 0 ? 0 : idx);
    if (idx < 0) return fallback;
    return normalizarCorHex(eqs[idx].cor, fallback);
  }

  function corTextoSobre(hex) {
    const h = normalizarCorHex(hex);
    const r = parseInt(h.slice(1, 3), 16);
    const g = parseInt(h.slice(3, 5), 16);
    const b = parseInt(h.slice(5, 7), 16);
    const luma = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return luma > 0.62 ? "#1a2a2e" : "#ffffff";
  }

  /** Selo colorido da equipe (painel da liderança). */
  function marcaEquipe(state, id, texto) {
    const cor = corEquipe(state, id);
    const fg = corTextoSobre(cor);
    const label = texto != null ? texto : nomeEquipe(state, id);
    return `<span class="eq-mark" style="background:${cor};color:${fg}">${esc(label)}</span>`;
  }

  function nomeFuncao(state, id) {
    const f = window.DiaconiaEngine.getFuncao(state, id);
    return f ? `${f.emoji} ${f.nome}` : id;
  }

  function listaFuncoesTroca(state, t) {
    if (t?.modalidade !== "cobertura") {
      const origem =
        Array.isArray(t?.slotsOrigem) && t.slotsOrigem.length
          ? t.slotsOrigem
          : t?.funcaoId
            ? [{ funcaoId: t.funcaoId }]
            : [];
      const nomes = [];
      const seen = new Set();
      for (const s of origem) {
        const n = nomeFuncao(state, s.funcaoId);
        if (!n || seen.has(n)) continue;
        seen.add(n);
        nomes.push(n);
      }
      return nomes;
    }
    const slots =
      Array.isArray(t?.slotsCobertura) && t.slotsCobertura.length
        ? t.slotsCobertura
        : t?.funcaoId
          ? [{ funcaoId: t.funcaoId }]
          : [];
    const nomes = [];
    const seen = new Set();
    for (const s of slots) {
      const n = nomeFuncao(state, s.funcaoId);
      if (!n || seen.has(n)) continue;
      seen.add(n);
      nomes.push(n);
    }
    return nomes;
  }

  function nomeFuncoesTroca(state, t) {
    return listaFuncoesTroca(state, t).join(", ");
  }

  /**
   * Confirma cobertura quando a pessoa está em 2+ funções no mesmo culto.
   * Retorna true se há só uma função (não pergunta) ou se o usuário confirmou.
   */
  function confirmarCoberturaTodasFuncoes({
    nomesFuncoes,
    dataBr,
    nomeQuemSai = "",
    nomeQuemCobre,
    visao = "pedido",
  }) {
    if (!nomesFuncoes || nomesFuncoes.length < 2) return Promise.resolve(true);
    const lista = `<ul class="confirm-funcoes">${nomesFuncoes.map((n) => `<li>${esc(n)}</li>`).join("")}</ul>`;
    let body;
    if (visao === "aceite") {
      body = `<p><strong>${esc(nomeQuemSai)}</strong> pediu para você cobrir <strong>${nomesFuncoes.length} funções</strong> em ${esc(dataBr)}:</p>
        ${lista}
        <p>Você assume <strong>todas</strong> elas e deixa qualquer função que já tivesse neste dia.</p>
        <p class="muted">Confirme só se realmente puder fazer isso.</p>`;
    } else {
      const quemSai = nomeQuemSai
        ? `<strong>${esc(nomeQuemSai)}</strong> está`
        : "Você está";
      const saiFora = nomeQuemSai ? `${esc(nomeQuemSai)} fica` : "você fica";
      body = `<p>${quemSai} em <strong>${nomesFuncoes.length} funções</strong> no culto de ${esc(dataBr)}:</p>
        ${lista}
        <p>Se confirmar, <strong>${esc(nomeQuemCobre)}</strong> assume <strong>todas</strong> e ${saiFora} fora deste dia.</p>
        <p class="muted">Só continue se for isso mesmo que deseja.</p>`;
    }
    return confirmModal({
      title: "Cobrir todas as funções?",
      body,
      okText: "Sim, cobrir todas",
      cancelText: "Não, voltar",
    });
  }

  /**
   * Confirma troca quando alguém está em 2+ funções no mesmo culto.
   * Retorna true se não há múltiplas funções ou se o usuário confirmou.
   */
  function confirmarTrocaTodasFuncoes({
    nomesOrigem = [],
    nomesAlvo = [],
    dataBr,
    nomeQuemSai = "",
    nomeQuemEntra = "",
    visao = "pedido",
  }) {
    if ((nomesOrigem || []).length < 2 && (nomesAlvo || []).length < 2) {
      return Promise.resolve(true);
    }
    const bloco = (titulo, nomes) => {
      if (!nomes.length) {
        return `<p><strong>${esc(titulo)}</strong> <span class="muted">— livre neste culto</span></p>`;
      }
      return `<p><strong>${esc(titulo)}</strong></p>
        <ul class="confirm-funcoes">${nomes.map((n) => `<li>${esc(n)}</li>`).join("")}</ul>`;
    };
    const tituloA = nomeQuemSai || "Quem pede";
    const tituloB = nomeQuemEntra || "Quem recebe";
    let body;
    if (visao === "aceite") {
      body = `<p><strong>${esc(tituloA)}</strong> pediu <strong>troca</strong> em ${esc(dataBr)}. Há diácono com várias funções neste culto.</p>
        ${bloco(tituloA, nomesOrigem)}
        ${bloco(tituloB, nomesAlvo)}
        <p>Se você aceitar, vocês permutam <strong>todas</strong> essas funções neste culto.</p>
        <p class="muted">Confirme só se realmente quiser esta troca.</p>`;
    } else {
      body = `<p>Há <strong>várias funções</strong> no culto de ${esc(dataBr)}. A troca permutará o dia inteiro:</p>
        ${bloco(tituloA, nomesOrigem)}
        ${bloco(tituloB, nomesAlvo)}
        <p>Vocês realmente querem fazer esta troca?</p>`;
    }
    return confirmModal({
      title: "Confirmar troca — várias funções",
      body,
      okText: "Sim, fazer a troca",
      cancelText: "Não, voltar",
    });
  }

  function nomeMinisterio(state, id) {
    if (!id) return "";
    const m = (state.ministerios || []).find((x) => x.id === id);
    if (!m) return "";
    const faixa =
      m.horarioInicio && m.horarioFim ? ` (${m.horarioInicio}–${m.horarioFim})` : "";
    return `${m.nome}${faixa}`;
  }

  function labelMinisterioDiacono(state, d) {
    if (!d) return "";
    const Eng = window.DiaconiaEngine;
    const list = Eng?.normalizeMinisteriosServico?.(d) || [];
    if (!list.length) return (d.funcaoMinisterio || "").trim();
    const partes = list.map((item) => {
      const nome = nomeMinisterio(state, item.ministerioId);
      const curto = nome ? nome.replace(/\s*\([^)]*\)\s*$/, "").trim() || nome : "";
      return [curto, item.funcaoMinisterio || ""].filter(Boolean).join(" · ");
    });
    return partes.filter(Boolean).join("; ");
  }

  function ministerioSelectOptions(listaMin, selectedId, diacono) {
    const Eng = window.DiaconiaEngine;
    const vinculos = Eng?.normalizeMinisteriosServico?.(diacono) || [];
    const idsVinculados = new Set(vinculos.map((x) => x.ministerioId).filter(Boolean));
    return [
      `<option value="">— Nenhum / só diaconia —</option>`,
      ...listaMin
        .filter((m) => m.ativo !== false || idsVinculados.has(m.id))
        .map((m) => {
          const faixa =
            m.horarioInicio && m.horarioFim ? ` (${m.horarioInicio}–${m.horarioFim})` : "";
          return `<option value="${esc(m.id)}" ${selectedId === m.id ? "selected" : ""}>${esc(m.nome)}${esc(faixa)}${m.ativo === false ? " (inativo)" : ""}</option>`;
        }),
    ].join("");
  }

  function ministerioExtraRowHtml(prefix, idx, item, listaMin, diacono) {
    return `<div class="ministerio-row ministerio-row-extra" data-min-idx="${idx}">
      <label class="field"><span>${idx + 1}º ministério</span>
        <select class="select min-id" data-idx="${idx}">${ministerioSelectOptions(listaMin, item.ministerioId || "", diacono)}</select>
      </label>
      <label class="field"><span>Papel / observação (opcional)</span>
        <input class="input min-obs" data-idx="${idx}" value="${esc(item.funcaoMinisterio || "")}" placeholder="Ex.: professor, backvocal…"/>
      </label>
      <button type="button" class="btn btn-ghost btn-sm min-rem" data-idx="${idx}">Remover</button>
    </div>`;
  }

  function ministeriosFormHtml(prefix, diacono, listaMin) {
    const Eng = window.DiaconiaEngine;
    const list = Eng?.normalizeMinisteriosServico?.(diacono) || [];
    const first = list[0] || { ministerioId: "", funcaoMinisterio: "" };
    const extras = list.slice(1);
    const multi = extras.length > 0;
    const minOpts = ministerioSelectOptions(listaMin, first.ministerioId || "", diacono);

    return `
      <label class="field"><span>Ministério (outro serviço)</span>
        <select id="${prefix}-ministerio-id" class="select">${minOpts}</select>
      </label>
      <label class="field"><span>Papel / observação no ministério (opcional)</span>
        <input id="${prefix}-ministerio" class="input" value="${esc(first.funcaoMinisterio || "")}" placeholder="Ex.: professor, backvocal…"/>
      </label>
      <p class="muted" style="font-size:12px;margin:-6px 0 8px">Se servir em outro ministério no culto, o gerador evita funções da diaconia no mesmo horário (pode servir antes ou depois).</p>
      <label class="field check-inline"><span><input type="checkbox" id="${prefix}-multi-ministerio" ${multi ? "checked" : ""}/> Sirvo em mais de um ministério</span></label>
      <div id="wrap-${prefix}-ministerios-extra" class="ministerios-extra-block" ${multi ? "" : "hidden"}>
        <div id="${prefix}-ministerios-extra-list" class="ministerios-extra-list">${
          extras.map((item, i) => ministerioExtraRowHtml(prefix, i + 1, item, listaMin, diacono)).join("")
        }</div>
        <button type="button" class="btn btn-ghost btn-sm" id="${prefix}-add-ministerio">+ adicionar outro ministério</button>
      </div>`;
  }

  function bindMinisteriosForm(root, prefix, listaMin = [], diacono = null) {
    const wrap = root.querySelector(`#wrap-${prefix}-ministerios-extra`);
    const list = root.querySelector(`#${prefix}-ministerios-extra-list`);
    const multiCb = root.querySelector(`#${prefix}-multi-ministerio`);
    const MAX = 6;
    const diaconoRef = { current: diacono };

    const ensureExtraRow = () => {
      if (!list || list.querySelector(".ministerio-row-extra")) return;
      list.insertAdjacentHTML("beforeend", ministerioExtraRowHtml(prefix, 1, {}, listaMin, diaconoRef.current));
    };

    const sync = () => {
      const multi = !!multiCb?.checked;
      if (wrap) wrap.hidden = !multi;
      if (multi) ensureExtraRow();
    };

    multiCb?.addEventListener("change", sync);

    root.querySelector(`#${prefix}-add-ministerio`)?.addEventListener("click", () => {
      if (!list) return;
      const n = list.querySelectorAll(".ministerio-row-extra").length;
      if (n >= MAX - 1) return toast("Limite de 6 ministérios.");
      list.insertAdjacentHTML(
        "beforeend",
        ministerioExtraRowHtml(prefix, n + 1, {}, listaMin, diaconoRef.current)
      );
    });

    list?.addEventListener("click", (ev) => {
      const btn = ev.target.closest(".min-rem");
      if (!btn || !list) return;
      const rows = list.querySelectorAll(".ministerio-row-extra");
      if (rows.length <= 1) {
        toast("Mantenha pelo menos um ministério extra ou desmarque a opção.");
        return;
      }
      btn.closest(".ministerio-row-extra")?.remove();
      [...list.querySelectorAll(".ministerio-row-extra")].forEach((row, i) => {
        row.dataset.minIdx = String(i + 1);
        const label = row.querySelector(".field span");
        if (label) label.textContent = `${i + 2}º ministério`;
      });
    });

    sync();
    return {
      sync,
      ler: () => lerMinisteriosForm(root, prefix),
    };
  }

  function lerMinisteriosForm(root, prefix) {
    const multiMinisterio = !!root.querySelector(`#${prefix}-multi-ministerio`)?.checked;
    const items = [
      {
        ministerioId: root.querySelector(`#${prefix}-ministerio-id`)?.value || "",
        funcaoMinisterio: root.querySelector(`#${prefix}-ministerio`)?.value.trim() || "",
      },
    ];
    if (multiMinisterio) {
      for (const row of root.querySelectorAll(`#${prefix}-ministerios-extra-list .ministerio-row-extra`)) {
        items.push({
          ministerioId: row.querySelector(".min-id")?.value || "",
          funcaoMinisterio: row.querySelector(".min-obs")?.value.trim() || "",
        });
      }
    }
    const servico = items.filter((x) => x.ministerioId);
    return {
      multiMinisterio,
      ministeriosServico: servico,
      ministerioId: servico[0]?.ministerioId || "",
      funcaoMinisterio: servico[0]?.funcaoMinisterio || "",
    };
  }

  function validarMinisteriosForm(data) {
    const list = data.ministeriosServico || [];
    const ids = list.map((x) => x.ministerioId).filter(Boolean);
    if (data.multiMinisterio && ids.length < 2) {
      return "Com mais de um ministério, selecione pelo menos dois na lista.";
    }
    const seen = new Set();
    for (const id of ids) {
      if (seen.has(id)) return "Selecione ministérios diferentes em cada linha.";
      seen.add(id);
    }
    return null;
  }

  /** Normaliza filhos: [{ nome, dataNascimento, idade }] a partir do cadastro. */
  function normalizeFilhos(diacono) {
    const Aniv = window.DiaconiaAniversarios;
    if (Array.isArray(diacono?.filhos) && diacono.filhos.length) {
      return diacono.filhos.map((f) => {
        const nome = String(f?.nome ?? "").trim();
        const dataNascimento = Aniv?.normalizarDataNascimento?.(f?.dataNascimento) || "";
        let idade =
          f?.idade === "" || f?.idade == null || Number.isNaN(Number(f.idade)) ? null : Number(f.idade);
        if (dataNascimento && Aniv?.idadeDe) {
          const calc = Aniv.idadeDe(dataNascimento);
          if (calc != null) idade = calc;
        }
        return { nome, dataNascimento, idade };
      });
    }
    return (diacono?.filhosNomes || [])
      .map((n) => String(n || "").trim())
      .filter(Boolean)
      .map((nome) => ({ nome, dataNascimento: "", idade: null }));
  }

  function filhoRowHtml(idx, filho = { nome: "", dataNascimento: "" }) {
    const nascVal = filho.dataNascimento || "";
    const ord = idx + 1;
    return `<div class="filho-row" data-filho-idx="${idx}">
      <label class="field"><span>${ord === 1 ? "Nome do filho(a)" : `${ord}º filho(a) — nome`}</span>
        <input class="input filho-nome" data-idx="${idx}" value="${esc(filho.nome || "")}" placeholder="Nome"/>
      </label>
      <label class="field"><span>Data de nascimento</span>
        <input class="input filho-nasc" data-idx="${idx}" type="date" value="${esc(nascVal)}"/>
      </label>
    </div>`;
  }

  /**
   * Tenho filhos? + Vai à igreja → nome+idade → botão "+ adicionar filho".
   * prefix: "p" (conta) ou "d" (liderança)
   */
  function filhosFormHtml(prefix, diacono, { labelTenho = "Tenho filhos" } = {}) {
    const filhos = normalizeFilhos(diacono);
    const tem = !!(diacono?.temFilhos ?? filhos.length > 0);
    const vaiIgreja = !!(diacono?.filhosVaoIgreja);
    const iniciais = tem ? (filhos.length ? filhos : [{ nome: "", dataNascimento: "" }]) : [];
    const rows = iniciais.map((f, i) => filhoRowHtml(i, f)).join("");

    return `
      <div class="check-pair">
        <label class="field check-inline"><span><input type="checkbox" id="${prefix}-tem-filhos" ${tem ? "checked" : ""}/> ${esc(labelTenho)}</span></label>
        <label class="field check-inline"><span><input type="checkbox" id="${prefix}-filhos-igreja" ${vaiIgreja ? "checked" : ""}/> Vai à igreja</span></label>
      </div>
      <div id="wrap-${prefix}-filhos" class="filhos-block" ${tem ? "" : "hidden"}>
        <div id="${prefix}-filhos-list" class="filhos-list">${rows}</div>
        <button type="button" class="btn btn-ghost btn-sm" id="${prefix}-add-filho">+ adicionar filho</button>
      </div>`;
  }

  function renumerarFilhos(list) {
    [...list.querySelectorAll(".filho-row")].forEach((row, i) => {
      row.dataset.filhoIdx = String(i);
      const nomeInput = row.querySelector(".filho-nome");
      const nascInput = row.querySelector(".filho-nasc");
      if (nomeInput) nomeInput.dataset.idx = String(i);
      if (nascInput) nascInput.dataset.idx = String(i);
      const label = row.querySelector(".field span");
      if (label) label.textContent = i === 0 ? "Nome do filho(a)" : `${i + 1}º filho(a) — nome`;
    });
  }

  function bindFilhosForm(root, prefix) {
    const wrap = root.querySelector(`#wrap-${prefix}-filhos`);
    const list = root.querySelector(`#${prefix}-filhos-list`);
    const MAX = 20;

    const sync = () => {
      const tem = !!root.querySelector(`#${prefix}-tem-filhos`)?.checked;
      if (!wrap) return;
      wrap.hidden = !tem;
      if (tem && list && !list.querySelector(".filho-row")) {
        list.insertAdjacentHTML("beforeend", filhoRowHtml(0));
      }
    };

    root.querySelector(`#${prefix}-tem-filhos`)?.addEventListener("change", sync);
    root.querySelector(`#${prefix}-add-filho`)?.addEventListener("click", () => {
      if (!list) return;
      const n = list.querySelectorAll(".filho-row").length;
      if (n >= MAX) return toast("Limite de 20 filhos.");
      list.insertAdjacentHTML("beforeend", filhoRowHtml(n));
      renumerarFilhos(list);
      list.querySelector(`.filho-nome[data-idx="${n}"]`)?.focus();
    });
    sync();
    return { sync, ler: () => lerFilhosForm(root, prefix) };
  }

  function lerFilhosForm(root, prefix) {
    const temFilhos = !!root.querySelector(`#${prefix}-tem-filhos`)?.checked;
    const filhosVaoIgreja = !!root.querySelector(`#${prefix}-filhos-igreja`)?.checked;
    if (!temFilhos) {
      return { temFilhos: false, qtdFilhos: 0, filhos: [], filhosNomes: [], filhosVaoIgreja: false };
    }
    const filhos = [...root.querySelectorAll(`#${prefix}-filhos-list .filho-row`)].map((row) => {
      const nome = row.querySelector(".filho-nome")?.value.trim() || "";
      const dataNascimento =
        window.DiaconiaAniversarios?.normalizarDataNascimento?.(
          row.querySelector(".filho-nasc")?.value
        ) || "";
      const idade = dataNascimento ? window.DiaconiaAniversarios?.idadeDe?.(dataNascimento) : null;
      return { nome, dataNascimento, idade: idade != null ? idade : null };
    });
    return {
      temFilhos: true,
      qtdFilhos: filhos.length,
      filhos,
      filhosNomes: filhos.map((f) => f.nome).filter(Boolean),
      filhosVaoIgreja,
    };
  }

  function validarFilhosForm(data) {
    if (!data?.temFilhos) return null;
    if (!data.filhos.length) return "Informe o nome e a data de nascimento do filho(a).";
    for (let i = 0; i < data.filhos.length; i++) {
      const f = data.filhos[i];
      const ord = i + 1;
      if (!f?.nome) return `Informe o nome do ${ord}º filho(a).`;
      if (!f.dataNascimento) return `Informe a data de nascimento do ${ord}º filho(a).`;
    }
    return null;
  }

  function aplicarFilhos(diacono, data) {
    diacono.temFilhos = !!data.temFilhos;
    diacono.qtdFilhos = data.temFilhos ? data.qtdFilhos : 0;
    diacono.filhos = data.temFilhos ? data.filhos : [];
    diacono.filhosNomes = data.temFilhos ? data.filhosNomes : [];
    diacono.filhosVaoIgreja = data.temFilhos ? !!data.filhosVaoIgreja : false;
  }

  function resumoFilhos(diacono) {
    const filhos = normalizeFilhos(diacono);
    if (!filhos.length) return "Sem filhos cadastrados.";
    const partes = filhos.map((f) => {
      const idade =
        f.idade != null
          ? ` (${f.idade} ano${f.idade === 1 ? "" : "s"})`
          : f.dataNascimento && window.DiaconiaAniversarios?.formatarData
            ? ` (nasc. ${window.DiaconiaAniversarios.formatarData(f.dataNascimento)})`
            : "";
      return `${f.nome}${idade}`;
    });
    const igreja = diacono?.filhosVaoIgreja ? " — vão à igreja" : "";
    return `${filhos.length} filho(s): ${partes.join(", ")}${igreja}.`;
  }

  function resumoFamiliaCurto(diacono) {
    if (!diacono) return "—";
    const partes = [];
    if (diacono.casado && diacono.conjugeNome) {
      let s = `💑 ${diacono.conjugeNome}`;
      if (diacono.conjugeMembroIgreja) s += " · membro";
      partes.push(s);
    } else if (diacono.casado) {
      partes.push("💑 Casado(a)");
    }
    const filhos = normalizeFilhos(diacono);
    if (filhos.length) {
      let s = `👶 ${filhos.length} filho(s)`;
      if (diacono.filhosVaoIgreja) s += " · vão à igreja";
      partes.push(s);
    }
    return partes.length ? partes.join(" · ") : `<span class="muted">—</span>`;
  }

  /**
   * Formulário compartilhado de dados pessoais (admin + diácono).
   * prefix: "p" (conta) ou "d" (liderança)
   */
  function dadosPessoaisFormHtml(prefix, diacono, opts = {}) {
    const {
      labelCasado = "Sou casado(a)",
      labelFilhos = "Tenho filhos",
      labelConjuge = "Casado(a) com",
      showWhatsappHint = true,
      ministerios = null,
    } = opts;
    const d = diacono || {};
    const listaMin = Array.isArray(ministerios) ? ministerios : [];
    const nascDiac = d.dataNascimento || "";
    const nascConj = d.conjugeDataNascimento || "";

    return `
      <label class="field"><span>Nome</span>
        <input id="${prefix}-nome" class="input" value="${esc(d.nome || "")}"/>
      </label>
      <label class="field"><span>Data de nascimento</span>
        <input id="${prefix}-nascimento" class="input" type="date" value="${esc(nascDiac)}"/>
      </label>
      <label class="field"><span>WhatsApp (DD)</span>
        <input id="${prefix}-whatsapp" class="input" inputmode="tel" value="${esc(d.whatsapp || "")}" placeholder="Ex.: 47999990000"/>
      </label>
      ${
        showWhatsappHint
          ? `<p class="muted" style="font-size:12px;margin:-6px 0 12px">Usado para pedidos de troca/cobertura.</p>`
          : ""
      }
      ${ministeriosFormHtml(prefix, d, listaMin)}
      <div class="check-pair">
        <label class="field check-inline"><span><input type="checkbox" id="${prefix}-casado" ${d.casado ? "checked" : ""}/> ${esc(labelCasado)}</span></label>
        <label class="field check-inline" id="wrap-${prefix}-conjuge-membro"><span><input type="checkbox" id="${prefix}-conjuge-membro" ${d.conjugeMembroIgreja ? "checked" : ""}/> É membro da igreja</span></label>
      </div>
      <label class="field" id="wrap-${prefix}-conjuge"><span>${esc(labelConjuge)}</span>
        <input id="${prefix}-conjuge" class="input" value="${esc(d.conjugeNome || "")}" placeholder="Nome do cônjuge"/>
      </label>
      <label class="field" id="wrap-${prefix}-conjuge-nasc"><span>Data de nascimento do cônjuge</span>
        <input id="${prefix}-conjuge-nasc" class="input" type="date" value="${esc(nascConj)}"/>
      </label>
      ${filhosFormHtml(prefix, d, { labelTenho: labelFilhos })}
      <label class="field"><span>Restrições pessoais</span>
        <textarea id="${prefix}-restricao" class="textarea" rows="${prefix === "p" ? 4 : 3}" placeholder="Limitações ou observações…">${esc(d.restricaoPessoal || "")}</textarea>
      </label>`;
  }

  function bindDadosPessoaisForm(root, prefix, opts = {}) {
    const syncCasado = () => {
      const on = !!root.querySelector(`#${prefix}-casado`)?.checked;
      const wrapConjuge = root.querySelector(`#wrap-${prefix}-conjuge`);
      const wrapMembro = root.querySelector(`#wrap-${prefix}-conjuge-membro`);
      const wrapConjNasc = root.querySelector(`#wrap-${prefix}-conjuge-nasc`);
      if (wrapConjuge) wrapConjuge.style.display = on ? "" : "none";
      if (wrapMembro) wrapMembro.style.display = on ? "" : "none";
      if (wrapConjNasc) wrapConjNasc.style.display = on ? "" : "none";
      if (!on) {
        const membro = root.querySelector(`#${prefix}-conjuge-membro`);
        if (membro) membro.checked = false;
        const nascConj = root.querySelector(`#${prefix}-conjuge-nasc`);
        if (nascConj) nascConj.value = "";
      }
    };
    root.querySelector(`#${prefix}-casado`)?.addEventListener("change", syncCasado);
    syncCasado();
    bindFilhosForm(root, prefix);
    const ministeriosBind = bindMinisteriosForm(root, prefix, opts.ministerios || [], opts.diacono);
    return { syncCasado, ministeriosBind };
  }

  function lerDadosPessoaisForm(root, prefix) {
    const casado = !!root.querySelector(`#${prefix}-casado`)?.checked;
    const filhosData = lerFilhosForm(root, prefix);
    const ministeriosData = lerMinisteriosForm(root, prefix);
    return {
      nome: root.querySelector(`#${prefix}-nome`)?.value.trim() || "",
      dataNascimento:
        window.DiaconiaAniversarios?.normalizarDataNascimento?.(
          root.querySelector(`#${prefix}-nascimento`)?.value
        ) || "",
      whatsapp: window.DiaconiaWhatsApp?.normalizarNumeroInternacional
        ? window.DiaconiaWhatsApp.normalizarNumeroInternacional(root.querySelector(`#${prefix}-whatsapp`)?.value)
        : String(root.querySelector(`#${prefix}-whatsapp`)?.value || "").replace(/\D/g, ""),
      ...ministeriosData,
      casado,
      conjugeNome: casado ? root.querySelector(`#${prefix}-conjuge`)?.value.trim() || "" : "",
      conjugeDataNascimento: casado
        ? window.DiaconiaAniversarios?.normalizarDataNascimento?.(
            root.querySelector(`#${prefix}-conjuge-nasc`)?.value
          ) || ""
        : "",
      conjugeMembroIgreja: casado && !!root.querySelector(`#${prefix}-conjuge-membro`)?.checked,
      restricaoPessoal: root.querySelector(`#${prefix}-restricao`)?.value.trim() || "",
      ...filhosData,
    };
  }

  function validarDadosPessoaisForm(data, opts = {}) {
    const { exigirNome = true, validarWhatsapp = false } = opts;
    if (exigirNome && !data.nome) return "Informe o nome.";
    if (validarWhatsapp && data.whatsapp && !window.DiaconiaWhatsApp?.numeroValido?.(data.whatsapp)) {
      return "WhatsApp inválido. Use DD + número (ex.: 47997845287).";
    }
    if (data.casado && !data.conjugeNome) return "Informe com quem é casado(a).";
    const errMin = validarMinisteriosForm(data);
    if (errMin) return errMin;
    return validarFilhosForm(data);
  }

  function aplicarDadosPessoais(diacono, data) {
    diacono.nome = data.nome;
    diacono.dataNascimento = data.dataNascimento || "";
    diacono.whatsapp = data.whatsapp;
    if (Array.isArray(data.ministeriosServico)) {
      diacono.ministeriosServico = data.ministeriosServico;
      window.DiaconiaEngine?.syncMinisteriosLegacy?.(diacono);
    } else {
      if (data.ministerioId !== undefined) diacono.ministerioId = data.ministerioId || "";
      diacono.funcaoMinisterio = data.funcaoMinisterio;
      window.DiaconiaEngine?.syncMinisteriosLegacy?.(diacono);
    }
    diacono.casado = data.casado;
    diacono.conjugeNome = data.conjugeNome;
    diacono.conjugeDataNascimento = data.conjugeDataNascimento || "";
    diacono.conjugeMembroIgreja = data.conjugeMembroIgreja;
    diacono.restricaoPessoal = data.restricaoPessoal;
    aplicarFilhos(diacono, data);
  }

  /** Prévia somente leitura — mesmos dados que o admin vê no cadastro. */
  function previewDadosPessoaisHtml(diacono, opts = {}) {
    const { titulo = "Seus dados atuais", vazio = "Nenhum dado cadastrado ainda." } = opts;
    if (!diacono) {
      return `<div class="dados-preview"><h3>${esc(titulo)}</h3><p class="muted">${esc(vazio)}</p></div>`;
    }

    const linhas = [];
    linhas.push(`<dt>Nome</dt><dd>${esc(diacono.nome || "—")}</dd>`);
    const nascTxt = diacono.dataNascimento
      ? `${window.DiaconiaAniversarios?.formatarData?.(diacono.dataNascimento) || diacono.dataNascimento}${
          window.DiaconiaAniversarios?.idadeDe?.(diacono.dataNascimento) != null
            ? ` (${window.DiaconiaAniversarios.idadeDe(diacono.dataNascimento)} anos)`
            : ""
        }`
      : `<span class="muted">Não informado</span>`;
    linhas.push(`<dt>Data de nascimento</dt><dd>${nascTxt}</dd>`);
    linhas.push(
      `<dt>WhatsApp</dt><dd>${
        diacono.whatsapp
          ? esc(diacono.whatsapp)
          : `<span class="muted">Não informado</span>`
      }</dd>`
    );
    const stPreview = opts.state || { ministerios: opts.ministerios || [] };
    const Eng = window.DiaconiaEngine;
    const mins = Eng?.normalizeMinisteriosServico?.(diacono) || [];
    let minHtml;
    if (mins.length) {
      const linhasMin = mins
        .map((item) => {
          const nome = item.ministerioId ? nomeMinisterio(stPreview, item.ministerioId) : "";
          const txt = [nome, item.funcaoMinisterio || ""].filter(Boolean).join(" · ");
          return txt ? `<li>${esc(txt)}</li>` : "";
        })
        .filter(Boolean)
        .join("");
      minHtml = linhasMin
        ? mins.length > 1
          ? `<ul class="preview-list">${linhasMin}</ul>`
          : esc([mins[0].ministerioId ? nomeMinisterio(stPreview, mins[0].ministerioId) : "", mins[0].funcaoMinisterio || ""].filter(Boolean).join(" · "))
        : `<span class="muted">Não informado</span>`;
    } else {
      minHtml = `<span class="muted">Não informado</span>`;
    }
    linhas.push(`<dt>Ministério${mins.length > 1 ? "s" : ""}</dt><dd>${minHtml}</dd>`);

    if (diacono.casado) {
      let conj = esc(diacono.conjugeNome || "—");
      if (diacono.conjugeMembroIgreja) conj += ` <span class="badge badge-ok">Membro da igreja</span>`;
      if (diacono.conjugeDataNascimento) {
        conj += `<div class="muted" style="font-size:12px;margin-top:4px">Nasc.: ${esc(
          window.DiaconiaAniversarios?.formatarData?.(diacono.conjugeDataNascimento) ||
            diacono.conjugeDataNascimento
        )}${
          window.DiaconiaAniversarios?.idadeDe?.(diacono.conjugeDataNascimento) != null
            ? ` (${window.DiaconiaAniversarios.idadeDe(diacono.conjugeDataNascimento)} anos)`
            : ""
        }</div>`;
      }
      linhas.push(`<dt>Cônjuge</dt><dd>${conj}</dd>`);
    } else {
      linhas.push(`<dt>Estado civil</dt><dd><span class="muted">Não casado(a)</span></dd>`);
    }

    const filhos = normalizeFilhos(diacono);
    if (filhos.length) {
      const lista = filhos
        .map((f) => {
          const idade =
            f.idade != null
              ? ` (${f.idade} ano${f.idade === 1 ? "" : "s"})`
              : f.dataNascimento
                ? ` (nasc. ${window.DiaconiaAniversarios?.formatarData?.(f.dataNascimento) || f.dataNascimento})`
                : "";
          return `<li>${esc(f.nome)}${idade}</li>`;
        })
        .join("");
      const igreja = diacono.filhosVaoIgreja
        ? ` <span class="badge badge-ok">Vão à igreja</span>`
        : "";
      linhas.push(`<dt>Filhos</dt><dd><ul class="preview-list">${lista}</ul>${igreja}</dd>`);
    } else {
      linhas.push(`<dt>Filhos</dt><dd><span class="muted">Nenhum cadastrado</span></dd>`);
    }

    linhas.push(
      `<dt>Restrições</dt><dd>${
        diacono.restricaoPessoal
          ? esc(diacono.restricaoPessoal)
          : `<span class="muted">Nenhuma informada</span>`
      }</dd>`
    );

    return `
      <div class="dados-preview">
        <h3>${esc(titulo)}</h3>
        <p class="muted preview-hint">O que está salvo aqui também aparece para a liderança. Altere abaixo e clique em Salvar.</p>
        <dl class="preview-dl">${linhas.join("")}</dl>
      </div>`;
  }

  function badgeTroca(status, { visaoDiacono = false } = {}) {
    if (visaoDiacono && status === "rejeitada") {
      return `<span class="badge badge-muted">Encerrado</span>`;
    }
    const map = {
      aguardando_aceite: { texto: "Aguardando aceite", tom: "warn" },
      aguardando_lider: { texto: "Aguardando liderança", tom: "warn" },
      aprovada: { texto: "Confirmada", tom: "ok" },
      recusada: { texto: "Recusada", tom: "danger" },
      rejeitada: { texto: "Rejeitada", tom: "danger" },
    };
    const info = map[status] || { texto: status, tom: "muted" };
    return `<span class="badge badge-${info.tom}">${esc(info.texto)}</span>`;
  }

  function whatsappUrl(numero, texto) {
    if (window.DiaconiaWhatsApp?.waMeUrl) {
      return window.DiaconiaWhatsApp.waMeUrl(numero, texto);
    }
    const n = String(numero).replace(/\D/g, "");
    return `https://wa.me/${n}?text=${encodeURIComponent(texto || "")}`;
  }

  function portalUrl(query = "") {
    if (window.DiaconiaWhatsApp?.portalUrl) {
      return window.DiaconiaWhatsApp.portalUrl(window.DiaconiaApp?.state || {}, query);
    }
    const base = `${window.location.origin}${window.location.pathname || "/"}`;
    if (!query) return base;
    return `${base}${query.startsWith("?") ? query : `?${query}`}`;
  }

  /** @deprecated use DiaconiaWhatsApp.notificarPedidoTroca */
  function abrirWhatsAppPedidoTroca(state, troca, deNome) {
    if (window.DiaconiaWhatsApp?.notificarPedidoTroca) {
      return window.DiaconiaWhatsApp.notificarPedidoTroca(state, troca, { deNome });
    }
    return { ok: false, erro: "Serviço WhatsApp indisponível." };
  }

  /** SVGs inline para botões de ação em tabelas */
  const ICONS = {
    eye: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`,
    book: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>`,
    pencil: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>`,
    trash: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>`,
    check: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>`,
    x: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`,
    refresh: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>`,
    download: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>`,
    "eye-off": `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/><path d="M14.12 14.12a3 3 0 1 1-4.24-4.24"/></svg>`,
  };

  function icon(name) {
    return ICONS[name] || "";
  }

  /**
   * Botão só com ícone — uso em colunas de ações de tabelas.
   * attrs: objeto de atributos HTML (ex.: { "data-act": "edit", "data-id": "x" })
   */
  function btnIcon({ icon: iconName, label, variant = "ghost", attrs = {}, disabled = false }) {
    const extra = Object.entries(attrs)
      .filter(([, v]) => v != null && v !== false)
      .map(([k, v]) => (v === true ? k : `${k}="${esc(String(v))}"`))
      .join(" ");
    const dis = disabled ? "disabled" : "";
    return `<button type="button" class="btn btn-${esc(variant)} btn-sm btn-icon" title="${esc(label)}" aria-label="${esc(label)}" ${extra} ${dis}>${icon(iconName)}</button>`;
  }

  /**
   * Campo de senha com botão para mostrar/ocultar.
   * extraAttrs: ex. { name: "senha", autocomplete: "current-password", required: true }
   */
  function passwordFieldHtml({ id, placeholder = "", className = "", value = "", extraAttrs = {} } = {}) {
    const idAttr = id ? ` id="${esc(id)}"` : "";
    const valAttr = value != null && value !== "" ? ` value="${esc(String(value))}"` : "";
    const extra = Object.entries(extraAttrs)
      .filter(([, v]) => v != null && v !== false)
      .map(([k, v]) => (v === true ? k : `${k}="${esc(String(v))}"`))
      .join(" ");
    return `<div class="input-password">
      <input type="password"${idAttr} class="${esc(className || "input")}" placeholder="${esc(placeholder)}"${valAttr} ${extra}/>
      <button type="button" class="btn-password-toggle" data-act="toggle-password" title="Mostrar senha" aria-label="Mostrar senha">${icon("eye")}</button>
    </div>`;
  }

  function bindPasswordToggles(root = document) {
    root.querySelectorAll("[data-act=toggle-password]").forEach((btn) => {
      if (btn.dataset.boundPassword) return;
      btn.dataset.boundPassword = "1";
      btn.addEventListener("click", () => {
        const wrap = btn.closest(".input-password");
        const input = wrap?.querySelector("input");
        if (!input) return;
        const show = input.type === "password";
        input.type = show ? "text" : "password";
        btn.innerHTML = icon(show ? "eye-off" : "eye");
        btn.title = show ? "Ocultar senha" : "Mostrar senha";
        btn.setAttribute("aria-label", btn.title);
      });
    });
  }

  return {
    $,
    $$,
    esc,
    toast,
    badgeStatus,
    badgeAtivo,
    openModal,
    closeModal,
    confirmModal,
    confirmDelete,
    confirmDeleteBulk,
    bulkTh,
    bulkTd,
    bulkBar,
    bindBulkTable,
    mesSelect,
    bindMesNav,
    nomeDiacono,
    nomeEquipe,
    equipeNomeDefinido,
    nomeEquipePublico,
    CORES_EQUIPE_PADRAO,
    corEquipePadrao,
    normalizarCorHex,
    corEquipe,
    corTextoSobre,
    marcaEquipe,
    nomeFuncao,
    listaFuncoesTroca,
    nomeFuncoesTroca,
    confirmarCoberturaTodasFuncoes,
    confirmarTrocaTodasFuncoes,
    nomeMinisterio,
    labelMinisterioDiacono,
    normalizeFilhos,
    filhosFormHtml,
    bindFilhosForm,
    lerFilhosForm,
    validarFilhosForm,
    aplicarFilhos,
    resumoFilhos,
    resumoFamiliaCurto,
    dadosPessoaisFormHtml,
    bindDadosPessoaisForm,
    lerDadosPessoaisForm,
    validarDadosPessoaisForm,
    aplicarDadosPessoais,
    previewDadosPessoaisHtml,
    badgeTroca,
    whatsappUrl,
    portalUrl,
    abrirWhatsAppPedidoTroca,
    icon,
    btnIcon,
    passwordFieldHtml,
    bindPasswordToggles,
  };
})();
