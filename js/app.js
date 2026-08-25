/**
 * DIACONIA — Escala Inteligente
 * Shell da aplicação: login, navegação, estado.
 */
window.DiaconiaApp = (() => {
  const UI = window.DiaconiaUI;

  const PAGINAS_SERVICO = new Set(["minha", "avisos", "conta", "ocorrencias"]);

  const app = {
    state: null,
    page: null,
    settingsTab: "geral",
    ano: 2026,
    mes: 8,

    save() {
      window.DiaconiaStorage.save(this.state);
    },

    async saveAndSync() {
      return window.DiaconiaStorage.saveAndSync(this.state);
    },

    setMes(ano, mes) {
      this.ano = ano;
      this.mes = mes;
      if (!this.state.meta) this.state.meta = {};
      this.state.meta.mesAtual = mes;
      this.state.meta.anoPadrao = ano;
      this.save();
      this.render();
    },

    /** Mantém diaconoId/nome da sessão alinhados ao usuário (ex.: líder que entrou na escala). */
    syncSessaoComUsuario() {
      const s = window.DiaconiaAuth.sessao();
      if (!s || !this.state) return s;
      const u = (this.state.usuarios || []).find((x) => x.id === s.usuarioId);
      if (!u) return s;
      const patch = {};
      if (u.nome && u.nome !== s.nome) patch.nome = u.nome;
      if (u.papel && u.papel !== s.papel) patch.papel = u.papel;
      const did = u.diaconoId || null;
      if (did !== (s.diaconoId || null)) patch.diaconoId = did;
      if (!Object.keys(patch).length) return s;
      return window.DiaconiaAuth.atualizarSessao(patch) || s;
    },

    liderNaEscala(sessao) {
      return sessao?.papel === "lider" && !!sessao?.diaconoId;
    },

    async boot() {
      if (typeof window.DiaconiaStorage.getOrInitAsync === "function") {
        this.state = await window.DiaconiaStorage.getOrInitAsync();
      } else {
        this.state = window.DiaconiaStorage.getOrInit();
      }
      this.ano = this.state.meta?.anoPadrao || 2026;
      this.mes = this.state.meta?.mesAtual || 8;

      this._stopSync?.();
      if (typeof window.DiaconiaStorage.startSync === "function") {
        this._stopSync = window.DiaconiaStorage.startSync((state) => {
          this.state = state;
          this.ano = state.meta?.anoPadrao || this.ano;
          this.mes = state.meta?.mesAtual || this.mes;
          if (window.DiaconiaAuth.sessao()) this.render();
        });
      }

      const sessao = this.syncSessaoComUsuario();
      if (!sessao) {
        this.renderLogin();
        return;
      }
      this.page = sessao.papel === "lider" ? "escalas" : "minha";
      this.applyDeepLink(sessao);
      this.render();
    },

    /** Link do WhatsApp: ?ir=avisos abre Avisos após login */
    applyDeepLink(sessao) {
      try {
        const params = new URLSearchParams(window.location.search);
        const ir = params.get("ir");
        if (!ir) return;
        const podeAvisos =
          sessao.papel === "diacono" || (sessao.papel === "lider" && sessao.diaconoId);
        if (podeAvisos && (ir === "avisos" || ir === "trocas")) {
          this.page = "avisos";
        }
        if (ir === "erros" && sessao.papel === "lider") {
          this.page = "erros";
        }
        if (ir === "ocorrencias" || ir === "ocorrenciasGestao") {
          if (sessao.papel === "lider") this.page = "ocorrenciasGestao";
          else if (sessao.papel === "diacono") this.page = "ocorrencias";
        }
        if (
          ir === "relatar" &&
          (sessao.papel === "diacono" || (sessao.papel === "lider" && sessao.diaconoId))
        ) {
          this._abrirRelatarErro = true;
        }
        params.delete("ir");
        const q = params.toString();
        const clean = `${window.location.pathname}${q ? `?${q}` : ""}${window.location.hash || ""}`;
        window.history.replaceState({}, "", clean);
      } catch {
        /* ignore */
      }
    },

    /** Páginas antigas do diácono → novas */
    normalizePage(page, isLider, naEscala) {
      if (!isLider && (page === "ocorrenciasGestao" || page === "ocorrencias")) {
        return "ocorrencias";
      }
      if (isLider && !naEscala && page === "ocorrencias") return "ocorrenciasGestao";
      if (isLider && naEscala && PAGINAS_SERVICO.has(page)) return page;
      if (isLider) return page;
      const map = {
        mes: "minha",
        restricoes: "avisos",
        trocas: "avisos",
        notificacoes: "avisos",
        perfil: "conta",
        falar: "conta",
      };
      return map[page] || page;
    },

    renderLogin() {
      const root = document.getElementById("app");
      root.classList.remove("has-announce");
      root.innerHTML = `
        <div class="login-screen">
          <div class="login-card">
            <div class="login-brand">
              <img class="login-logo" src="assets/logo-viva-church.png" alt="VIVA. Church" width="220" height="84"/>
            </div>
            <div class="eyebrow">Diaconia</div>
            <h1>Escala Inteligente</h1>
            <p class="lead">Central mensal da escala do diaconato — planejar, gerar e consultar com clareza.</p>
            <form id="login-form">
              <label class="field"><span>Login</span><input name="login" autocomplete="username" required placeholder="Seu usuário"/></label>
              <label class="field"><span>Senha</span>${UI.passwordFieldHtml({ placeholder: "••••••••", extraAttrs: { name: "senha", autocomplete: "current-password", required: true } })}</label>
              <button class="btn btn-primary btn-block" type="submit">Entrar</button>
              <p id="login-erro" class="alert alert-danger hidden" style="margin-top:12px"></p>
            </form>
          </div>
        </div>`;

      UI.bindPasswordToggles(root);

      root.querySelector("#login-form").addEventListener("submit", (e) => {
        e.preventDefault();
        const fd = new FormData(e.target);
        const res = window.DiaconiaAuth.login(fd.get("login"), fd.get("senha"), this.state);
        const err = root.querySelector("#login-erro");
        if (!res.ok) {
          err.textContent = res.erro;
          err.classList.remove("hidden");
          return;
        }
        this.syncSessaoComUsuario();
        this.page = res.sessao.papel === "lider" ? "escalas" : "minha";
        this.applyDeepLink(window.DiaconiaAuth.sessao() || res.sessao);
        this.render();
      });
    },

    navLiderBase() {
      return [
        { id: "escalas", label: "Escalas" },
        { sep: true, label: "Pessoas" },
        { id: "diaconos", label: "Diáconos" },
        { id: "equipes", label: "Equipes" },
        { id: "casais", label: "Casais" },
        { id: "usuarios", label: "Usuários" },
        { sep: true, label: "Operação" },
        { id: "funcoes", label: "Funções" },
        { id: "restricoes", label: "Avisos" },
        { id: "trocas", label: "Troca / Cobrir" },
        { id: "ocorrenciasGestao", label: "Ocorrências" },
        { id: "comunicados", label: "Comunicados" },
        { sep: true, label: "Sistema" },
        { id: "erros", label: "Relatos de erro" },
        { id: "historico", label: "Histórico" },
        { id: "configuracoes", label: "Configurações" },
      ];
    },

    navDiacono() {
      return [
        { id: "minha", label: "Minha escala" },
        { id: "avisos", label: "Avisos" },
        { id: "ocorrencias", label: "Ocorrências" },
        { id: "conta", label: "Minha conta" },
      ];
    },

    /** Líder na escala: atalhos do próprio serviço + gestão. */
    navLiderComServico() {
      return [
        { sep: true, label: "Meu serviço" },
        { id: "minha", label: "Minha escala" },
        { id: "avisos", label: "Meus avisos" },
        { id: "ocorrencias", label: "Ocorrências" },
        { id: "conta", label: "Minha conta" },
        { sep: true, label: "Gestão" },
        ...this.navLiderBase(),
      ];
    },

    unreadCount() {
      const uid = window.DiaconiaAuth.sessao()?.usuarioId;
      return (this.state.notificacoes || []).filter((n) => n.usuarioId === uid && !n.lida).length;
    },

    /** Avisos "Não posso ir" aguardando aprovação da liderança */
    restricoesPendentes() {
      return (this.state.restricoes || []).filter((r) => r.status === "pendente").length;
    },

    avisosPendentes() {
      const sessao = window.DiaconiaAuth.sessao();
      if (!sessao) return 0;
      const unread = this.unreadCount();
      const did = sessao.diaconoId;
      const aceites = (this.state.trocas || []).filter(
        (t) => t.paraDiaconoId === did && t.status === "aguardando_aceite"
      ).length;
      return unread + aceites;
    },

    paginaDeServico(page) {
      return PAGINAS_SERVICO.has(page);
    },

    render() {
      const sessao = this.syncSessaoComUsuario();
      if (typeof UI.closeModal === "function") UI.closeModal();
      if (!sessao) {
        this.renderLogin();
        return;
      }

      const isLider = sessao.papel === "lider";
      const naEscala = this.liderNaEscala(sessao);
      this.page = this.normalizePage(this.page, isLider, naEscala);

      if (isLider && !naEscala && this.paginaDeServico(this.page)) {
        this.page = "escalas";
      }

      const nav = isLider
        ? naEscala
          ? this.navLiderComServico()
          : this.navLiderBase()
        : this.navDiacono();

      const pendGestao = isLider ? this.restricoesPendentes() : 0;
      const pendServico = !isLider || naEscala ? this.avisosPendentes() : 0;
      const errosAbertos = isLider
        ? window.DiaconiaErrors?.abertos?.(this.state)?.length || 0
        : 0;

      const navParts = [];
      let zoneBuf = [];
      let zoneKind = null;
      const flushZone = () => {
        if (!zoneBuf.length) return;
        if (zoneKind === "servico" || zoneKind === "gestao") {
          navParts.push(
            `<div class="nav-zone nav-zone-${zoneKind}" role="group" aria-label="${
              zoneKind === "servico" ? "Meu serviço" : "Gestão"
            }">${zoneBuf.join("")}</div>`
          );
        } else {
          navParts.push(zoneBuf.join(""));
        }
        zoneBuf = [];
      };
      const pushItemHtml = (item) => {
        if (item.sep) {
          zoneBuf.push(`<div class="nav-sep">${UI.esc(item.label || "")}</div>`);
          return;
        }
        let label = item.label;
        if (item.id === "restricoes" && pendGestao) label += ` (${pendGestao})`;
        if (item.id === "avisos" && pendServico) label += ` (${pendServico})`;
        if (item.id === "erros" && errosAbertos) label += ` (${errosAbertos})`;
        if (item.id === "ocorrenciasGestao") {
          const n = window.DiaconiaOcorrencias?.pendentesAdmin?.(this.state)?.length || 0;
          if (n) label += ` (${n})`;
        }
        zoneBuf.push(
          `<button class="nav-btn ${this.page === item.id ? "active" : ""}" data-page="${item.id}">${label}</button>`
        );
      };
      for (const item of nav) {
        if (item.sep && (item.label === "Meu serviço" || item.label === "Gestão")) {
          flushZone();
          zoneKind = item.label === "Meu serviço" ? "servico" : "gestao";
          pushItemHtml(item);
          continue;
        }
        pushItemHtml(item);
      }
      flushZone();
      const navHtml = navParts.join("");

      const papelLabel = isLider
        ? naEscala
          ? "Liderança · na escala"
          : "Liderança"
        : "Diácono";

      const anuncios = (this.state.comunicados || []).filter(
        (c) => c.ativo !== false && String(c.texto || "").trim()
      );
      const textoAnuncio = anuncios.map((c) => String(c.texto).trim()).join("   ·   ");
      const durAnuncio = Math.max(22, Math.min(72, Math.round(textoAnuncio.length * 0.12)));
      const anuncioHtml = textoAnuncio
        ? `<div class="announce-bar" role="region" aria-live="polite" aria-label="Comunicados da liderança">
            <span class="announce-badge">Comunicado</span>
            <div class="announce-viewport">
              <div class="announce-marquee" style="--announce-dur:${durAnuncio}s">
                <span class="announce-chunk">${UI.esc(textoAnuncio)}</span>
                <span class="announce-chunk" aria-hidden="true">${UI.esc(textoAnuncio)}</span>
              </div>
            </div>
          </div>`
        : "";

      const root = document.getElementById("app");
      root.classList.toggle("has-announce", !!textoAnuncio);
      root.innerHTML = `
        ${anuncioHtml}
        <button class="btn btn-primary mobile-toggle" id="menu-toggle" aria-label="Menu">☰</button>
        <div class="app-shell${textoAnuncio ? " with-announce" : ""}">
          <aside class="sidebar" id="sidebar">
            <div class="brand">
              <div class="brand-logo-wrap">
                <img class="brand-logo" src="assets/logo-viva-church.png" alt="VIVA. Church" width="168" height="64"/>
              </div>
              <div class="brand-text">
                <div class="brand-title">Diaconia</div>
                <div class="brand-sub">${UI.esc(this.state.configuracoes?.nomeIgreja || "Escala Inteligente")}</div>
              </div>
            </div>
            <nav class="sidebar-nav" aria-label="Menu principal">
              ${navHtml}
            </nav>
            <div class="sidebar-foot">
              <div class="user-chip">
                <span class="user-chip-name">${UI.esc(sessao.nome)}</span>
                <span class="user-chip-role">${papelLabel}</span>
              </div>
              ${
                !isLider || naEscala
                  ? `<button type="button" class="sidebar-relatar-erro" id="btn-relatar-erro" title="Só use se algo no portal falhou">Problema no sistema?</button>`
                  : ""
              }
              <button class="nav-btn nav-btn-logout" id="btn-logout">Sair</button>
            </div>
          </aside>
          <main class="main" id="main"></main>
        </div>`;

      root.querySelector("#menu-toggle")?.addEventListener("click", () => {
        root.querySelector("#sidebar")?.classList.toggle("open");
      });

      root.querySelectorAll("[data-page]").forEach((btn) => {
        btn.addEventListener("click", () => {
          this.page = btn.dataset.page;
          root.querySelector("#sidebar")?.classList.remove("open");
          this.render();
        });
      });

      root.querySelector("#btn-logout")?.addEventListener("click", () => {
        window.DiaconiaAuth.logout();
        this.renderLogin();
      });

      root.querySelector("#btn-relatar-erro")?.addEventListener("click", () => {
        window.DiaconiaViewsDiacono?.abrirRelatarErro?.(this, {
          pagina: this.page,
        });
      });

      const main = root.querySelector("#main");
      const usarVisaoDiacono = this.paginaDeServico(this.page) && (!isLider || naEscala);
      const pack = usarVisaoDiacono
        ? window.DiaconiaViewsDiacono.pages[this.page]
        : window.DiaconiaViewsLider.pages[this.page];

      if (!pack) {
        main.innerHTML = `<div class="panel empty">Página não encontrada.</div>`;
        return;
      }

      main.innerHTML = pack.render(this);
      pack.bind?.(this, main);

      if (this._abrirRelatarErro) {
        this._abrirRelatarErro = false;
        setTimeout(() => {
          window.DiaconiaViewsDiacono?.abrirRelatarErro?.(this, { pagina: this.page });
        }, 0);
      }
    },
  };

  document.addEventListener("DOMContentLoaded", () => {
    app.boot().catch(() => {
      app.state = window.DiaconiaStorage.getOrInit();
      app.ano = app.state.meta?.anoPadrao || 2026;
      app.mes = app.state.meta?.mesAtual || 8;
      if (window.DiaconiaAuth.sessao()) app.render();
      else app.renderLogin();
    });
  });
  return app;
})();
