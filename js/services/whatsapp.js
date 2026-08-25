/**
 * Canal WhatsApp — preparado para evolução:
 * - modo "manual": abre wa.me (hoje)
 * - modo "api": enfileira e chama backend (futuro)
 *
 * Toda mensagem do sistema deve passar por aqui.
 */
window.DiaconiaWhatsApp = (() => {
  const Engine = () => window.DiaconiaEngine;
  const Cal = () => window.DiaconiaCalendar;
  const Hist = () => window.DiaconiaHistory;

  const MODOS = { manual: "manual", api: "api" };
  const DESTINOS = { app: "app", web: "web" };
  const DESTINO_KEY = "diaconia_wa_destino";

  function cfgPadrao() {
    return {
      ativo: true,
      modo: MODOS.manual,
      /** No celular: true abre direto. No PC o painel sempre pergunta o tipo (app vs Web). */
      abrirDireto: false,
      abrirNoNavegador: false,
      notificarPedidoTroca: true,
      notificarRespostaTroca: true,
      notificarCadastroUsuario: true,
      /** Avisar líderes quando diácono envia "Não posso ir" */
      notificarRestricao: true,
      /** Avisar diácono quando líder aprova ou recusa o aviso */
      notificarStatusRestricao: true,
      /**
       * Avisar líderes quando o diácono toca “Estou ciente, mas não consigo agora”
       * (emergência sem pedir cobertura).
       */
      notificarEmergenciaSemCobertura: true,
      /**
       * IDs de líderes que recebem o aviso de emergência.
       * null/undefined = ainda não configurado → todos os ativos;
       * [] = ninguém; [ids] = só esses.
       */
      lideresRecebemEmergenciaIds: null,
      notificarEscalaGerada: false,
      portalBaseUrl: "",
      apiUrl: "",
      apiToken: "",
    };
  }

  function cfg(state) {
    const base = cfgPadrao();
    const c = state?.configuracoes?.whatsapp || {};
    return { ...base, ...c };
  }

  function ensure(state) {
    if (!state.configuracoes) state.configuracoes = {};
    if (!state.configuracoes.whatsapp || typeof state.configuracoes.whatsapp !== "object") {
      state.configuracoes.whatsapp = cfgPadrao();
    } else {
      const prev = state.configuracoes.whatsapp;
      state.configuracoes.whatsapp = { ...cfgPadrao(), ...prev };
      // Preserva null explícito (ainda não configurado → todos)
      if (prev.lideresRecebemEmergenciaIds === null) {
        state.configuracoes.whatsapp.lideresRecebemEmergenciaIds = null;
      }
    }
    if (!Array.isArray(state.whatsappFila)) state.whatsappFila = [];
    if (!Array.isArray(state.whatsappLog)) state.whatsappLog = [];
    return state.configuracoes.whatsapp;
  }

  function normalizarNumero(numero) {
    return String(numero || "").replace(/\D/g, "");
  }

  /**
   * Número internacional para o WhatsApp (BR).
   * Aceita 047997845287, 47997845287 ou 5547997845287 → 5547997845287.
   * Remove o zero de tronco e inclui 55 quando faltar.
   */
  function normalizarNumeroInternacional(numero) {
    let n = normalizarNumero(numero);
    if (!n) return n;

    if (n.startsWith("550") && n.length >= 13 && n.length <= 14) {
      n = `55${n.slice(3)}`;
    }

    if (n.startsWith("55") && (n.length === 12 || n.length === 13)) {
      return n;
    }

    n = n.replace(/^0+/, "");

    if ((n.length === 10 || n.length === 11) && /^[1-9]\d/.test(n)) {
      n = `55${n}`;
    }

    return n;
  }

  function numeroValido(numero) {
    const n = normalizarNumeroInternacional(numero);
    return n.length >= 12 && n.length <= 15;
  }

  function primeiroNome(nome) {
    return String(nome || "").trim().split(/\s+/)[0] || "";
  }

  function nomeIgreja(state) {
    return state.configuracoes?.nomeIgreja?.trim() || "Diaconia";
  }

  function nomeFuncao(state, funcaoId) {
    const f = Engine().getFuncao(state, funcaoId);
    return f ? `${f.emoji || ""} ${f.nome}`.trim() : funcaoId || "—";
  }

  function nomesFuncoesTroca(state, troca) {
    if (typeof window.DiaconiaSwaps?.nomesFuncoesTroca === "function") {
      return window.DiaconiaSwaps.nomesFuncoesTroca(state, troca);
    }
    return nomeFuncao(state, troca?.funcaoId);
  }

  function nomeDiacono(state, diaconoId) {
    return state.diaconos.find((d) => d.id === diaconoId)?.nome || "Diácono";
  }

  /** Resolve WhatsApp: usuário vinculado → diácono → líder */
  function numeroDeDiacono(state, diaconoId) {
    const d = (state.diaconos || []).find((x) => x.id === diaconoId);
    if (!d) return { ok: false, erro: "Diácono não encontrado.", numero: "", nome: "" };

    const usuario = (state.usuarios || []).find((u) => u.diaconoId === diaconoId);
    if (usuario) {
      const u = numeroDeUsuario(state, usuario);
      if (u.ok) return { ok: true, numero: u.numero, nome: u.nome, diacono: d, usuario };
    }

    const numero = normalizarNumeroInternacional(d.whatsapp);
    if (!numeroValido(numero)) {
      return {
        ok: false,
        erro: `${d.nome} ainda não tem WhatsApp válido cadastrado (use DD + número, ex.: 47997845287).`,
        numero: "",
        nome: d.nome,
        diacono: d,
      };
    }
    return { ok: true, numero, nome: d.nome, diacono: d, usuario: usuario || null };
  }

  function numeroDeUsuario(state, usuario) {
    if (!usuario) return { ok: false, erro: "Usuário não encontrado.", numero: "", nome: "" };

    let raw = usuario.whatsapp;

    if (!raw && usuario.diaconoId) {
      raw = state.diaconos.find((x) => x.id === usuario.diaconoId)?.whatsapp;
    }

    if (!raw && usuario.papel === "lider") {
      raw = (state.lideres || []).find((x) => x.usuarioId === usuario.id)?.whatsapp;
    }

    const numero = normalizarNumeroInternacional(raw);
    if (!numeroValido(numero)) {
      return {
        ok: false,
        erro: `${usuario.nome} ainda não tem WhatsApp válido. Cadastre com DD + número (ex.: 47997845287).`,
        numero: "",
        nome: usuario.nome,
      };
    }
    return { ok: true, numero, nome: usuario.nome, usuario };
  }

  function numeroDeLider(state, lider) {
    if (!lider) return { ok: false, erro: "Líder não encontrado.", numero: "", nome: "" };
    let raw = lider.whatsapp;
    if (!raw && lider.usuarioId) {
      const u = state.usuarios.find((x) => x.id === lider.usuarioId);
      if (u?.whatsapp) raw = u.whatsapp;
    }
    const numero = normalizarNumeroInternacional(raw);
    if (!numeroValido(numero)) {
      return {
        ok: false,
        erro: `${lider.nome} ainda não tem WhatsApp cadastrado (ex.: 47997845287).`,
        numero: "",
        nome: lider.nome,
      };
    }
    return { ok: true, numero, nome: lider.nome, lider };
  }

  /**
   * Líderes ativos que devem receber um tipo de aviso.
   * @param {string[]|null|undefined} idsSelecionados
   *   null/undefined = todos os ativos; [] = ninguém; [ids] = só esses.
   */
  function lideresDestino(state, idsSelecionados) {
    const ativos = (state.lideres || []).filter((l) => l.ativo !== false);
    if (idsSelecionados == null) return ativos;
    if (!Array.isArray(idsSelecionados) || !idsSelecionados.length) return [];
    const set = new Set(idsSelecionados.filter(Boolean));
    return ativos.filter((l) => set.has(l.id));
  }

  function portalUrl(state, query = "") {
    const c = cfg(state);
    const root = (c.portalBaseUrl || "").trim()
      ? String(c.portalBaseUrl).replace(/\/$/, "")
      : `${window.location.origin}${window.location.pathname || "/"}`;
    if (!query) return root;
    return `${root}${query.startsWith("?") ? query : `?${query}`}`;
  }

  function isMobile() {
    return (
      typeof navigator !== "undefined" &&
      /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent || "")
    );
  }

  function lerDestinoPreferido() {
    try {
      const v = localStorage.getItem(DESTINO_KEY);
      if (v === DESTINOS.web || v === DESTINOS.app) return v;
    } catch {
      /* ignore */
    }
    return null;
  }

  function salvarDestinoPreferido(destino) {
    if (destino !== DESTINOS.web && destino !== DESTINOS.app) return;
    try {
      localStorage.setItem(DESTINO_KEY, destino);
    } catch {
      /* ignore */
    }
  }

  function clickToChatQuery(numero, texto) {
    const n = normalizarNumeroInternacional(numero);
    const parts = [`phone=${n}`];
    if (texto) parts.push(`text=${encodeURIComponent(texto)}`);
    parts.push("type=phone_number");
    parts.push("app_absent=0");
    return parts.join("&");
  }

  /** WhatsApp Web — abre a conversa daquele número, não a tela inicial. */
  function waWebUrl(numero, texto) {
    return `https://web.whatsapp.com/send/?${clickToChatQuery(numero, texto)}`;
  }

  /** Click-to-chat oficial — abre a conversa no app instalado (PC) ou no celular. */
  function waMeUrl(numero, texto) {
    return `https://api.whatsapp.com/send/?${clickToChatQuery(numero, texto)}`;
  }

  function waAppUrl(numero, texto) {
    return waMeUrl(numero, texto);
  }

  function abrirUrl(url, { sameTab = false } = {}) {
    if (sameTab || isMobile()) {
      window.location.href = url;
      return;
    }
    let opened = null;
    try {
      opened = window.open(url, "_blank", "noopener,noreferrer");
    } catch {
      opened = null;
    }
    if (opened) return;
    const a = document.createElement("a");
    a.href = url;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  function abrirWhatsAppWeb(numero, texto) {
    const n = normalizarNumeroInternacional(numero);
    if (!numeroValido(n)) {
      return { ok: false, erro: "Número de WhatsApp inválido." };
    }
    const url = waWebUrl(n, texto);
    abrirUrl(url);
    return { ok: true, url, via: DESTINOS.web, numero: n };
  }

  /** Abre a conversa da pessoa no app desta máquina (ou no celular). */
  function abrirWhatsAppApp(numero, texto) {
    const n = normalizarNumeroInternacional(numero);
    if (!numeroValido(n)) {
      return { ok: false, erro: "Número de WhatsApp inválido." };
    }
    const url = waMeUrl(n, texto);
    if (isMobile()) {
      window.location.href = url;
      return { ok: true, url, via: DESTINOS.app, numero: n };
    }
    abrirUrl(url);
    return { ok: true, url, via: DESTINOS.app, numero: n };
  }

  /** Abre a conversa no app (wa.me) — usado também pelos testes */
  function abrirConversaWhatsapp(numero, texto) {
    return abrirWhatsAppApp(numero, texto);
  }

  function whatsappDeDiacono(state, diaconoId) {
    return numeroDeDiacono(state, diaconoId);
  }

  async function copiarTexto(texto) {
    try {
      await navigator.clipboard.writeText(texto);
      return true;
    } catch {
      return false;
    }
  }

  function painelEnvioManual({ nome, numero, texto }) {
    const UI = window.DiaconiaUI;
    const numFmt = normalizarNumeroInternacional(numero);
    const titulo = nome ? `WhatsApp — ${nome}` : "Enviar pelo WhatsApp";
    const preferido = lerDestinoPreferido();

    if (!UI?.openModal) {
      if (preferido === DESTINOS.web) abrirWhatsAppWeb(numFmt, texto);
      else abrirWhatsAppApp(numFmt, texto);
      return;
    }

    const clsApp = preferido === DESTINOS.app ? " is-last" : "";
    const clsWeb = preferido === DESTINOS.web ? " is-last" : "";
    const tagApp = preferido === DESTINOS.app ? ` · <em class="choice-last">usado da última vez</em>` : "";
    const tagWeb = preferido === DESTINOS.web ? ` · <em class="choice-last">usado da última vez</em>` : "";

    UI.openModal(`
      <h2>${UI.esc(titulo)}</h2>
      <p class="muted" style="margin-top:0;font-size:13px">
        A mensagem já foi <strong>copiada</strong>. Qual WhatsApp você quer usar nesta máquina?
      </p>
      <p class="muted" style="font-size:12px;margin:-4px 0 12px">Número: <strong>${UI.esc(numFmt)}</strong></p>
      <div class="choice-stack" id="wa-destino-stack">
        <button type="button" class="btn btn-choice${clsApp}" data-act="wa-app">
          <strong>App instalado</strong>
          <span>WhatsApp Desktop / Windows — usa a sessão desta máquina${tagApp}</span>
        </button>
        <button type="button" class="btn btn-choice${clsWeb}" data-act="wa-web">
          <strong>WhatsApp Web</strong>
          <span>Abre no navegador (Chrome/Edge)${tagWeb}</span>
        </button>
      </div>
      <label class="field"><span>Mensagem</span>
        <textarea id="wa-painel-texto" class="textarea" rows="8" readonly>${UI.esc(texto)}</textarea>
      </label>
      <div class="modal-actions" style="flex-wrap:wrap">
        <button type="button" class="btn btn-ghost" data-act="wa-copy">Copiar mensagem</button>
        <button type="button" class="btn btn-ghost" data-act="cancel">Fechar</button>
      </div>
    `);

    const m = document.getElementById("modal-root");
    const textoAtual = () => m.querySelector("#wa-painel-texto")?.value || texto;
    m?.addEventListener("click", async (e) => {
      const act = e.target.closest("[data-act]")?.dataset.act;
      if (act === "cancel") return UI.closeModal();
      if (act === "wa-app") {
        salvarDestinoPreferido(DESTINOS.app);
        abrirWhatsAppApp(numFmt, textoAtual());
        return;
      }
      if (act === "wa-web") {
        salvarDestinoPreferido(DESTINOS.web);
        abrirWhatsAppWeb(numFmt, textoAtual());
        return;
      }
      if (act === "wa-copy") {
        const ok = await copiarTexto(textoAtual());
        UI.toast(ok ? "Mensagem copiada." : "Não foi possível copiar.");
      }
    });
  }

  function motivoAvisoTexto(restricao) {
    if (restricao?.motivoViagem === "trabalho") return "Viagem a trabalho";
    if (restricao?.motivoViagem === "familiar") return "Viagem familiar";
    const obs = String(restricao?.observacao || "");
    if (/emergência/i.test(obs)) return "Emergência";
    if (/ministério/i.test(obs)) return "Escalado em outro ministério";
    const map = {
      indisponivel: "Não pode participar neste dia",
      funcao: "Não pode fazer determinada função",
      horario: "Chega mais tarde",
      outro: "Outro motivo",
    };
    return map[restricao?.tipo] || restricao?.tipo || "Indisponibilidade";
  }

  /** Templates — único lugar para textos */
  function montarMensagem(state, tipo, dados) {
    const igreja = nomeIgreja(state);

    if (tipo === "pedido_troca" || tipo === "pedido_cobertura") {
      const { troca, deNome } = dados;
      const alvo = state.diaconos.find((d) => d.id === troca.paraDiaconoId);
      const fnNome = nomesFuncoesTroca(state, troca);
      const dataBr = Cal().formatBR(troca.data);
      const link = portalUrl(state, "?ir=avisos");
      const quem = deNome || "Alguém da diaconia";
      const nome = primeiroNome(alvo?.nome) || alvo?.nome || "";
      const varias = (troca.slotsCobertura || []).length > 1;
      const rotuloFn = varias ? "Funções" : "Função";
      const multiTroca =
        troca.modalidade !== "cobertura" &&
        (troca.multifuncao || (troca.slotsOrigem || []).length > 1 || (troca.slotsAlvo || []).length > 1);

      if (troca.modalidade === "cobertura" || tipo === "pedido_cobertura") {
        return (
          `Olá, ${nome}! 👋\n\n` +
          `*${quem}* pediu sua *cobertura* na escala do diaconato:\n\n` +
          `📅 *Data:* ${dataBr}\n` +
          `📋 *${rotuloFn}:* ${fnNome}\n` +
          (varias ? `⚠️ Quem sai será substituído em *todas* as funções deste culto.\n` : "") +
          `⛪ *${igreja}*\n\n` +
          `Sua escala já foi atualizada provisoriamente. Entre no portal, abra *Avisos* e toque em *Aceitar* ou *Recusar*:\n\n` +
          `${link}\n\n` +
          `Use seu login e senha cadastrados.`
        );
      }

      return (
        `Olá, ${nome}! 👋\n\n` +
        `*${quem}* pediu *troca* de função na escala:\n\n` +
        `📅 *Data:* ${dataBr}\n` +
        `📋 *Função:* ${fnNome}\n` +
        (multiTroca
          ? `⚠️ Há diácono com *várias funções* neste culto. Se você aceitar, permutam *todas* as funções deste dia.\n`
          : "") +
        `⛪ *${igreja}*\n\n` +
        (multiTroca
          ? `A escala *ainda não mudou*. Confirme ou recuse em *Avisos* no portal:\n\n`
          : `A escala já foi ajustada provisoriamente. Confirme ou recuse em *Avisos* no portal:\n\n`) +
        `${link}\n\n` +
        `Use seu login e senha cadastrados.`
      );
    }

    if (tipo === "troca_aceita") {
      const { troca, porNome } = dados;
      const solicitante = state.diaconos.find((d) => d.id === troca.deDiaconoId);
      const nome = primeiroNome(solicitante?.nome) || solicitante?.nome || "";
      const fnNome = nomesFuncoesTroca(state, troca);
      const dataBr = Cal().formatBR(troca.data);
      const link = portalUrl(state, "?ir=avisos");
      const rotulo = troca.modalidade === "cobertura" ? "cobertura" : "troca";
      const rotuloFn =
        (troca.slotsCobertura || []).length > 1 ||
        (troca.slotsOrigem || []).length > 1 ||
        (troca.slotsAlvo || []).length > 1
          ? "Funções"
          : "Função";

      return (
        `Olá, ${nome}! ✅\n\n` +
        `*${porNome || "O diácono"}* *aceitou* seu pedido de ${rotulo}:\n\n` +
        `📅 *Data:* ${dataBr}\n` +
        `📋 *${rotuloFn}:* ${fnNome}\n\n` +
        `A escala está confirmada. Veja no portal:\n${link}`
      );
    }

    if (tipo === "troca_recusada") {
      const { troca, porNome } = dados;
      const solicitante = state.diaconos.find((d) => d.id === troca.deDiaconoId);
      const nome = primeiroNome(solicitante?.nome) || solicitante?.nome || "";
      const dataBr = Cal().formatBR(troca.data);
      const link = portalUrl(state, "?ir=avisos");
      const rotulo = troca.modalidade === "cobertura" ? "cobertura" : "troca";

      return (
        `Olá, ${nome}.\n\n` +
        `*${porNome || "O diácono"}* *recusou* seu pedido de ${rotulo} para *${dataBr}*.\n\n` +
        `Sua escala voltou ao normal. Se ainda precisar de ajuda, peça cobertura a outra pessoa em *Avisos*:\n\n` +
        `${link}`
      );
    }

    if (tipo === "aviso_restricao") {
      const { nomeLider, diaconoNome, data, dataFim, motivo, observacao } = dados;
      const link = portalUrl(state, "?ir=restricoes");
      const obs = observacao?.trim() ? `\n💬 *Detalhe:* ${observacao.trim()}` : "";
      const dataBr =
        dataFim && dataFim !== data
          ? `${Cal().formatBR(data)} a ${Cal().formatBR(dataFim)}`
          : Cal().formatBR(data);

      return (
        `Olá, ${primeiroNome(nomeLider) || nomeLider}! 📢\n\n` +
        `*${diaconoNome}* informou indisponibilidade:\n\n` +
        `📅 *Período:* ${dataBr}\n` +
        `📝 *Motivo:* ${motivo || "Indisponibilidade"}${obs}\n` +
        `⛪ *${igreja}*\n\n` +
        `Isso já vale para a geração da escala. Veja em *Avisos*:\n${link}`
      );
    }

    if (tipo === "emergencia_sem_cobertura") {
      const { nomeLider, diaconoNome, data } = dados;
      const link = portalUrl(state, "?ir=restricoes");
      const dataBr = Cal().formatBR(data);

      return (
        `Olá, ${primeiroNome(nomeLider) || nomeLider}! 🚨\n\n` +
        `*${diaconoNome}* *não poderá comparecer* em *${dataBr}* porque teve uma *emergência*.\n\n` +
        `Ainda *não pediu cobertura* — a escala precisa de atenção da liderança.\n` +
        `⛪ *${igreja}*\n\n` +
        `Veja em *Avisos*:\n${link}`
      );
    }

    if (tipo === "restricao_aprovada" || tipo === "restricao_recusada") {
      const { nome, data, status } = dados;
      const link = portalUrl(state, "?ir=avisos");
      const dataBr = Cal().formatBR(data);

      if (status === "aprovada") {
        return (
          `Olá, ${primeiroNome(nome) || nome}! ✅\n\n` +
          `A liderança *confirmou* seu aviso para *${dataBr}*.\n\n` +
          `Isso será considerado na geração da escala. Acompanhe em *Avisos*:\n${link}`
        );
      }

      return (
        `Olá, ${primeiroNome(nome) || nome}.\n\n` +
        `Sobre seu aviso para *${dataBr}*: a liderança manteve sua *escala como está*.\n\n` +
        `Se precisar conversar, fale com um líder pelo portal (*Minha conta*):\n${link}`
      );
    }

    if (tipo === "cadastro_usuario") {
      const { usuario, senha } = dados;
      const nome = primeiroNome(usuario?.nome) || usuario?.nome || "";
      const login = usuario?.login || "";
      const link = portalUrl(state);
      const papel =
        usuario?.papel === "lider"
          ? "Como *liderança*, você gerencia escalas, diáconos, equipes e avisos."
          : "Como *diácono*, você vê sua escala, envia avisos e pede cobertura.";

      return (
        `Olá, ${nome}! 👋\n\n` +
        `Sua conta no portal *${igreja}* foi criada.\n\n` +
        `🔐 *Login:* ${login}\n` +
        `🔑 *Senha:* ${senha}\n\n` +
        `${papel}\n\n` +
        `Acesse o portal:\n${link}\n\n` +
        `Recomendamos alterar a senha em *Minha conta* no primeiro acesso.`
      );
    }

    return dados?.texto || "";
  }

  function registrarLog(state, entry) {
    state.whatsappLog = state.whatsappLog || [];
    state.whatsappLog.unshift({
      id: Engine().uid("wa"),
      em: new Date().toISOString(),
      ...entry,
    });
    if (state.whatsappLog.length > 200) state.whatsappLog.length = 200;
  }

  function enfileirar(state, item) {
    state.whatsappFila = state.whatsappFila || [];
    const row = {
      id: Engine().uid("wq"),
      status: "pendente",
      tentativas: 0,
      criadoEm: new Date().toISOString(),
      ...item,
    };
    state.whatsappFila.unshift(row);
    if (state.whatsappFila.length > 100) state.whatsappFila.length = 100;
    return row;
  }

  async function enviarViaApi(state, payload) {
    const c = cfg(state);
    if (!c.apiUrl) {
      return { ok: false, erro: "API WhatsApp ainda não configurada (apiUrl).", pendenteApi: true };
    }
    try {
      const headers = { "Content-Type": "application/json" };
      if (c.apiToken) headers.Authorization = `Bearer ${c.apiToken}`;
      const res = await fetch(c.apiUrl, {
        method: "POST",
        headers,
        body: JSON.stringify({
          to: payload.numero,
          text: payload.texto,
          tipo: payload.tipo,
          meta: payload.meta || {},
          portalLink: payload.portalLink || null,
        }),
      });
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        return { ok: false, erro: `API WhatsApp falhou (${res.status}). ${body}`.trim() };
      }
      return { ok: true, via: "api" };
    } catch (err) {
      return { ok: false, erro: err?.message || "Falha de rede ao chamar API WhatsApp." };
    }
  }

  function enviarManual(payload, state) {
    const num = normalizarNumeroInternacional(payload.numero);
    const texto = payload.texto || "";
    const c = cfg(state || window.DiaconiaApp?.state);
    const noCelularDireto = isMobile() && c.abrirDireto !== false && payload.usarPainelManual !== true;
    const usarPainel = !noCelularDireto;

    copiarTexto(texto).catch(() => {});

    if (usarPainel) {
      painelEnvioManual({ nome: payload.nome, numero: num, texto });
      return { ok: true, via: "manual_painel", url: waMeUrl(num, texto), copiado: true, nome: payload.nome };
    }

    const aberto = abrirWhatsAppApp(num, texto);
    if (!aberto.ok) return aberto;
    return { ok: true, via: "manual_direto", url: aberto.url, copiado: true, nome: payload.nome };
  }

  function enviar(state, { tipo, paraDiaconoId, paraNumero, paraUsuarioId, texto, meta, abrirNoNavegador }) {
    ensure(state);
    const c = cfg(state);
    if (!c.ativo) {
      return { ok: false, erro: "Canal WhatsApp desativado nas configurações." };
    }

    let numero = normalizarNumeroInternacional(paraNumero);
    let nome = meta?.nome || "";

    if (paraUsuarioId) {
      const u = state.usuarios.find((x) => x.id === paraUsuarioId);
      const dest = numeroDeUsuario(state, u);
      if (!dest.ok) return dest;
      numero = dest.numero;
      nome = dest.nome;
    } else if (paraDiaconoId) {
      const dest = numeroDeDiacono(state, paraDiaconoId);
      if (!dest.ok) return dest;
      numero = dest.numero;
      nome = dest.nome;
    }

    if (!numeroValido(numero)) {
      return { ok: false, erro: "Número de WhatsApp inválido." };
    }
    if (!texto) return { ok: false, erro: "Mensagem vazia." };

    numero = normalizarNumeroInternacional(numero);

    const payload = {
      tipo: tipo || "generico",
      numero,
      texto,
      nome,
      meta: meta || {},
      portalLink: portalUrl(state, "?ir=avisos"),
      abrirNoNavegador: abrirNoNavegador ?? c.abrirNoNavegador,
    };

    if (c.modo === MODOS.api) {
      const fila = enfileirar(state, {
        ...payload,
        paraDiaconoId: paraDiaconoId || null,
        paraUsuarioId: paraUsuarioId || null,
        modo: MODOS.api,
      });
      registrarLog(state, {
        tipo: payload.tipo,
        paraDiaconoId: paraDiaconoId || null,
        numero,
        status: "enfileirado",
        modo: MODOS.api,
        filaId: fila.id,
        meta: payload.meta,
      });
      Hist().add(state, {
        tipo: "whatsapp",
        mensagem: `WhatsApp enfileirado (${payload.tipo}) → ${nome || numero}.`,
        meta: { filaId: fila.id, tipo: payload.tipo },
      });
      enviarViaApi(state, payload).then((res) => {
        const item = (state.whatsappFila || []).find((x) => x.id === fila.id);
        if (item) {
          item.tentativas = (item.tentativas || 0) + 1;
          item.status = res.ok ? "enviado" : "erro";
          item.ultimoErro = res.ok ? null : res.erro;
          item.atualizadoEm = new Date().toISOString();
        }
        registrarLog(state, {
          tipo: payload.tipo,
          paraDiaconoId: paraDiaconoId || null,
          numero,
          status: res.ok ? "enviado" : "erro",
          modo: MODOS.api,
          erro: res.erro || null,
          meta: payload.meta,
        });
        try {
          window.DiaconiaStorage?.save?.(state);
        } catch {
          /* ignore */
        }
      });
      return { ok: true, via: "api", filaId: fila.id, nome, pendenteApi: !c.apiUrl };
    }

    const res = enviarManual(payload, state);
    registrarLog(state, {
      tipo: payload.tipo,
      paraDiaconoId: paraDiaconoId || null,
      numero,
      status: "aberto_manual",
      modo: MODOS.manual,
      meta: payload.meta,
    });
    Hist().add(state, {
      tipo: "whatsapp",
      mensagem: `WhatsApp aberto (${payload.tipo}) → ${nome || numero}.`,
      meta: { tipo: payload.tipo, paraDiaconoId },
    });
    return { ...res, nome };
  }

  function notificarPedidoTroca(state, troca, { deNome } = {}) {
    ensure(state);
    const c = cfg(state);
    if (!c.ativo || !c.notificarPedidoTroca) {
      return { ok: false, erro: "Notificação de troca por WhatsApp está desligada.", ignorado: true };
    }
    const tipoMsg = troca.modalidade === "cobertura" ? "pedido_cobertura" : "pedido_troca";
    const texto = montarMensagem(state, tipoMsg, { troca, deNome });
    return enviar(state, {
      tipo: tipoMsg,
      paraDiaconoId: troca.paraDiaconoId,
      texto,
      meta: { trocaId: troca.id, data: troca.data, modalidade: troca.modalidade },
    });
  }

  function notificarRespostaTroca(state, troca, { aceita, porNome } = {}) {
    ensure(state);
    const c = cfg(state);
    if (!c.ativo || c.notificarRespostaTroca === false) {
      return { ok: false, ignorado: true, erro: "Notificação de resposta de troca desligada." };
    }
    const tipoMsg = aceita ? "troca_aceita" : "troca_recusada";
    const texto = montarMensagem(state, tipoMsg, { troca, porNome });
    return enviar(state, {
      tipo: tipoMsg,
      paraDiaconoId: troca.deDiaconoId,
      texto,
      meta: { trocaId: troca.id, aceita: !!aceita },
    });
  }

  function notificarCadastroUsuario(state, usuario, { senha } = {}) {
    ensure(state);
    const c = cfg(state);
    if (!c.ativo || c.notificarCadastroUsuario === false) {
      return { ok: false, erro: "Notificação de cadastro por WhatsApp está desligada.", ignorado: true };
    }
    return compartilharCredenciaisUsuario(state, usuario, { senha });
  }

  function compartilharCredenciaisUsuario(state, usuario, { senha } = {}) {
    ensure(state);
    const c = cfg(state);
    if (!c.ativo) {
      return { ok: false, erro: "Canal WhatsApp desativado nas configurações." };
    }
    if (!senha) {
      return { ok: false, erro: "Senha não informada para enviar no WhatsApp." };
    }
    const dest = numeroDeUsuario(state, usuario);
    if (!dest.ok) return dest;
    const texto = montarMensagem(state, "cadastro_usuario", { usuario, senha });
    return enviar(state, {
      tipo: "cadastro_usuario",
      paraNumero: dest.numero,
      texto,
      meta: { usuarioId: usuario.id, login: usuario.login, papel: usuario.papel, manual: true, nome: dest.nome },
    });
  }

  function notificarAvisoRestricao(state, restricao, { diaconoNome } = {}) {
    ensure(state);
    const c = cfg(state);
    if (!c.ativo || !c.notificarRestricao) {
      return { ok: false, ignorado: true, erro: "Notificação de restrição desligada." };
    }
    const lideres = (state.lideres || []).filter((l) => l.ativo !== false);
    const comNumero = lideres
      .map((l) => ({ l, dest: numeroDeLider(state, l) }))
      .filter((x) => x.dest.ok);

    if (!comNumero.length) {
      return { ok: false, erro: "Nenhum líder com WhatsApp cadastrado." };
    }

    const motivo = motivoAvisoTexto(restricao);
    const resultados = comNumero.map(({ l, dest }, idx) => {
      const texto = montarMensagem(state, "aviso_restricao", {
        nomeLider: l.nome,
        diaconoNome: diaconoNome || nomeDiacono(state, restricao.diaconoId),
        data: restricao.data,
        dataFim: restricao.dataFim || null,
        motivo,
        observacao: restricao.observacao,
      });
      return enviar(state, {
        tipo: "aviso_restricao",
        paraNumero: dest.numero,
        texto,
        meta: { restricaoId: restricao.id, liderId: l.id },
        abrirNoNavegador: c.modo === MODOS.manual && idx === 0,
      });
    });
    return { ok: resultados.some((r) => r.ok), resultados };
  }

  /**
   * Diácono tocou “Estou ciente, mas não consigo agora”:
   * avisa os líderes escolhidos em Configurações → WhatsApp.
   */
  function notificarEmergenciaSemCobertura(state, { diaconoId, diaconoNome, data } = {}) {
    ensure(state);
    const c = cfg(state);
    if (!c.ativo || c.notificarEmergenciaSemCobertura === false) {
      return { ok: false, ignorado: true, erro: "Notificação de emergência desligada." };
    }
    if (!data) return { ok: false, erro: "Data não informada." };

    const lideres = lideresDestino(state, c.lideresRecebemEmergenciaIds);
    const comNumero = lideres
      .map((l) => ({ l, dest: numeroDeLider(state, l) }))
      .filter((x) => x.dest.ok);

    if (!comNumero.length) {
      return {
        ok: false,
        erro:
          lideres.length === 0
            ? "Nenhum líder selecionado para receber este aviso (Configurações → WhatsApp)."
            : "Nenhum líder selecionado tem WhatsApp válido cadastrado.",
      };
    }

    const nome =
      diaconoNome ||
      (diaconoId ? nomeDiacono(state, diaconoId) : null) ||
      "Um diácono";

    const resultados = comNumero.map(({ l, dest }, idx) => {
      const texto = montarMensagem(state, "emergencia_sem_cobertura", {
        nomeLider: l.nome,
        diaconoNome: nome,
        data,
      });
      return enviar(state, {
        tipo: "emergencia_sem_cobertura",
        paraNumero: dest.numero,
        texto,
        meta: {
          liderId: l.id,
          diaconoId: diaconoId || null,
          data,
          nome: dest.nome,
        },
        abrirNoNavegador: c.modo === MODOS.manual && idx === 0,
      });
    });

    return {
      ok: resultados.some((r) => r.ok),
      resultados,
      enviados: resultados.filter((r) => r.ok).length,
      total: comNumero.length,
    };
  }

  function notificarStatusRestricao(state, restricao, { status } = {}) {
    ensure(state);
    const c = cfg(state);
    if (!c.ativo || c.notificarStatusRestricao === false) {
      return { ok: false, ignorado: true, erro: "Notificação de status de aviso desligada." };
    }
    if (status !== "aprovada" && status !== "rejeitada") {
      return { ok: false, ignorado: true };
    }
    const nome = nomeDiacono(state, restricao.diaconoId);
    const tipoMsg = status === "aprovada" ? "restricao_aprovada" : "restricao_recusada";
    const texto = montarMensagem(state, tipoMsg, { nome, data: restricao.data, status });
    return enviar(state, {
      tipo: tipoMsg,
      paraDiaconoId: restricao.diaconoId,
      texto,
      meta: { restricaoId: restricao.id, status },
    });
  }

  async function processarFila(state) {
    ensure(state);
    const c = cfg(state);
    if (c.modo !== MODOS.api) return { ok: true, processados: 0, mensagem: "Modo manual — sem fila de API." };
    const pendentes = (state.whatsappFila || []).filter((x) => x.status === "pendente" || x.status === "erro");
    let ok = 0;
    for (const item of pendentes) {
      const res = await enviarViaApi(state, item);
      item.tentativas = (item.tentativas || 0) + 1;
      item.status = res.ok ? "enviado" : "erro";
      item.ultimoErro = res.ok ? null : res.erro;
      item.atualizadoEm = new Date().toISOString();
      if (res.ok) ok += 1;
    }
    return { ok: true, processados: ok, total: pendentes.length };
  }

  function resumoCadastro(state) {
    const lista = state.diaconos || [];
    const com = lista.filter((d) => numeroDeDiacono(state, d.id).ok).length;
    return { total: lista.length, comWhatsapp: com, semWhatsapp: lista.length - com };
  }

  return {
    MODOS,
    cfgPadrao,
    cfg,
    ensure,
    normalizarNumero,
    normalizarNumeroInternacional,
    numeroValido,
    whatsappDeDiacono,
    numeroDeDiacono,
    numeroDeUsuario,
    numeroDeLider,
    portalUrl,
    waMeUrl,
    waWebUrl,
    waAppUrl,
    abrirConversaWhatsapp,
    abrirWhatsAppApp,
    abrirWhatsAppWeb,
    painelEnvioManual,
    montarMensagem,
    motivoAvisoTexto,
    enviar,
    notificarPedidoTroca,
    notificarRespostaTroca,
    notificarCadastroUsuario,
    compartilharCredenciaisUsuario,
    notificarAvisoRestricao,
    notificarEmergenciaSemCobertura,
    notificarStatusRestricao,
    lideresDestino,
    processarFila,
    resumoCadastro,
  };
})();

