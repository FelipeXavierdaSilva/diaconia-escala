/**
 * DIACONIA — Escala Inteligente
 * Shell da aplicação: login, navegação, estado.
 */
window.DiaconiaApp = (() => {
  const UI = window.DiaconiaUI;

  const app = {
    state: null,
    page: null,
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
      this.state.meta.mesAtual = mes;
      this.save();
      this.render();
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

      const sessao = window.DiaconiaAuth.sessao();
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
        if (sessao.papel === "diacono" && (ir === "avisos" || ir === "trocas")) {
          this.page = "avisos";
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
    normalizePage(page, isLider) {
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
      root.innerHTML = `
        <div class="login-screen">
          <div class="login-card">
            <div class="eyebrow">Diaconia Viva</div>
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
        this.page = res.sessao.papel === "lider" ? "escalas" : "minha";
        this.applyDeepLink(res.sessao);
        this.render();
      });
    },

    navLider() {
      return [
        { id: "escalas", label: "📅 Escalas" },
        { id: "diaconos", label: "👥 Diáconos" },
        { id: "equipes", label: "👨‍👩‍👧 Equipes" },
        { id: "casais", label: "💑 Casais" },
        { id: "funcoes", label: "📋 Funções" },
        { id: "restricoes", label: "🔔 Avisos" },
        { id: "trocas", label: "🔄 Troca/Cobrir" },
        { id: "usuarios", label: "👤 Usuários" },
        { id: "historico", label: "📊 Histórico" },
        { id: "configuracoes", label: "⚙️ Configurações" },
      ];
    },

    navDiacono() {
      return [
        { id: "minha", label: "Minha escala" },
        { id: "avisos", label: "Avisos" },
        { id: "conta", label: "Minha conta" },
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

    render() {
      const sessao = window.DiaconiaAuth.sessao();
      if (!sessao) {
        this.renderLogin();
        return;
      }

      const isLider = sessao.papel === "lider";
      this.page = this.normalizePage(this.page, isLider);
      const nav = isLider ? this.navLider() : this.navDiacono();
      const badgeN = isLider ? this.restricoesPendentes() : this.avisosPendentes();

      const navHtml = nav
        .map((item) => {
          let label = item.label;
          if (isLider && item.id === "restricoes" && badgeN) label += ` (${badgeN})`;
          if (!isLider && item.id === "avisos" && badgeN) label += ` (${badgeN})`;
          return `<button class="nav-btn ${this.page === item.id ? "active" : ""}" data-page="${item.id}">${label}</button>`;
        })
        .join("");

      const root = document.getElementById("app");
      root.innerHTML = `
        <button class="btn btn-primary mobile-toggle" id="menu-toggle" aria-label="Menu">☰</button>
        <div class="app-shell">
          <aside class="sidebar" id="sidebar">
            <div class="brand">
              <div class="brand-title">Diaconia</div>
              <div class="brand-sub">Escala Inteligente · ${UI.esc(this.state.configuracoes?.nomeIgreja || "")}</div>
            </div>
            ${navHtml}
            <div class="sidebar-foot">
              <div class="user-chip">${UI.esc(sessao.nome)} · ${isLider ? "Liderança" : "Diácono"}</div>
              <button class="nav-btn" id="btn-logout">Sair</button>
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

      const main = root.querySelector("#main");
      const pack = isLider
        ? window.DiaconiaViewsLider.pages[this.page]
        : window.DiaconiaViewsDiacono.pages[this.page];

      if (!pack) {
        main.innerHTML = `<div class="panel empty">Página não encontrada.</div>`;
        return;
      }

      main.innerHTML = pack.render(this);
      pack.bind?.(this, main);
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
