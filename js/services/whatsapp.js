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

  function cfgPadrao() {
    return {
      ativo: true,
      /** manual = wa.me | api = envio pelo servidor (futuro) */
      modo: MODOS.manual,
      /** Quando true, abre o WhatsApp do navegador no modo manual */
      abrirNoNavegador: true,
      /** Dispara aviso ao solicitar troca/cobertura */
      notificarPedidoTroca: true,
      /** Envia login/senha ao criar usuário */
      notificarCadastroUsuario: true,
      /** Reservado: avisos de restrição / escala / etc. */
      notificarRestricao: false,
      notificarEscalaGerada: false,
      /** URL pública do portal (vazia = usa a URL atual do browser) */
      portalBaseUrl: "",
      /** Futuro: endpoint do backend WhatsApp Business / Evolution / etc. */
      apiUrl: "",
      /** Futuro: token — preferir guardar no servidor, não no browser */
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
      state.configuracoes.whatsapp = { ...cfgPadrao(), ...state.configuracoes.whatsapp };
    }
    if (!Array.isArray(state.whatsappFila)) state.whatsappFila = [];
    if (!Array.isArray(state.whatsappLog)) state.whatsappLog = [];
    return state.configuracoes.whatsapp;
  }

  function normalizarNumero(numero) {
    return String(numero || "").replace(/\D/g, "");
  }

  function numeroValido(numero) {
    const n = normalizarNumero(numero);
    return n.length >= 10 && n.length <= 15;
  }

  function whatsappDeDiacono(state, diaconoId) {
    const d = (state.diaconos || []).find((x) => x.id === diaconoId);
    if (!d) return { ok: false, erro: "Diácono não encontrado.", diacono: null, numero: "" };
    const numero = normalizarNumero(d.whatsapp);
    if (!numeroValido(numero)) {
      return {
        ok: false,
        erro: `${d.nome} ainda não tem WhatsApp válido cadastrado.`,
        diacono: d,
        numero: "",
      };
    }
    return { ok: true, diacono: d, numero };
  }

  function numeroDeUsuario(state, usuario) {
    if (!usuario) return { ok: false, erro: "Usuário não encontrado.", numero: "", nome: "" };
    let numero = normalizarNumero(usuario.whatsapp);
    if (!numeroValido(numero) && usuario.diaconoId) {
      const dest = whatsappDeDiacono(state, usuario.diaconoId);
      if (dest.ok) return { ok: true, numero: dest.numero, nome: dest.diacono.nome };
      return { ok: false, erro: dest.erro, numero: "", nome: usuario.nome };
    }
    if (!numeroValido(numero) && usuario.papel === "lider") {
      const l = (state.lideres || []).find((x) => x.usuarioId === usuario.id);
      numero = normalizarNumero(l?.whatsapp);
    }
    if (!numeroValido(numero)) {
      return {
        ok: false,
        erro: `${usuario.nome} ainda não tem WhatsApp válido cadastrado.`,
        numero: "",
        nome: usuario.nome,
      };
    }
    return { ok: true, numero, nome: usuario.nome };
  }

  function portalUrl(state, query = "") {
    const c = cfg(state);
    const root = (c.portalBaseUrl || "").trim()
      ? String(c.portalBaseUrl).replace(/\/$/, "")
      : `${window.location.origin}${window.location.pathname || "/"}`;
    if (!query) return root;
    return `${root}${query.startsWith("?") ? query : `?${query}`}`;
  }

  function waMeUrl(numero, texto) {
    return `https://wa.me/${normalizarNumero(numero)}?text=${encodeURIComponent(texto || "")}`;
  }

  function nomeFuncao(state, funcaoId) {
    const f = Engine().getFuncao(state, funcaoId);
    return f ? `${f.emoji || ""} ${f.nome}`.trim() : funcaoId;
  }

  /** Templates — único lugar para textos futuros da API */
  function montarMensagem(state, tipo, dados) {
    if (tipo === "pedido_troca") {
      const { troca, deNome } = dados;
      const alvo = state.diaconos.find((d) => d.id === troca.paraDiaconoId);
      const fnNome = nomeFuncao(state, troca.funcaoId);
      const dataBr = Cal().formatBR(troca.data);
      const link = portalUrl(state, "?ir=avisos");
      const quem = deNome || "Alguém da diaconia";
      const nome = alvo?.nome || "";
      if (troca.modalidade === "cobertura") {
        return `Olá ${nome}! ${quem} pediu para você *cobrir* ${fnNome} em ${dataBr}.\n\nEntre no portal Diaconia com seu login e senha e aceite o pedido em *Avisos*:\n${link}`;
      }
      return `Olá ${nome}! ${quem} pediu *troca* de ${fnNome} em ${dataBr}.\n\nEntre no portal Diaconia com seu login e senha e aceite o pedido em *Avisos*:\n${link}`;
    }

    if (tipo === "aviso_restricao") {
      const { nomeLider, diaconoNome, data, motivo } = dados;
      const link = portalUrl(state, "?ir=restricoes");
      return `Olá ${nomeLider || ""}! ${diaconoNome} enviou um aviso (${motivo || "indisponibilidade"}) para ${Cal().formatBR(data)}.\n\nVeja em Avisos no portal:\n${link}`;
    }

    if (tipo === "cadastro_usuario") {
      const { usuario, senha } = dados;
      const nome = usuario?.nome || "";
      const login = usuario?.login || "";
      const link = portalUrl(state);
      const igreja = state.configuracoes?.nomeIgreja || "Diaconia";
      const papel =
        usuario?.papel === "lider"
          ? "Como *liderança*, você pode gerenciar escalas, diáconos e equipes."
          : "Como *diácono*, você pode ver sua escala, avisos e solicitar trocas.";
      return (
        `Olá ${nome}! Sua conta no portal *${igreja}* foi criada.\n\n` +
        `*Login:* ${login}\n*Senha:* ${senha}\n\n` +
        `${papel}\n\nAcesse o portal:\n${link}\n\n` +
        `Guarde estas informações com segurança. Você pode alterar a senha depois em *Minha conta*.`
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

  /**
   * Futuro: POST para apiUrl com Bearer apiToken.
   * Payload padronizado para o backend.
   */
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

  function enviarManual(payload) {
    const url = waMeUrl(payload.numero, payload.texto);
    if (payload.abrirNoNavegador !== false) {
      window.open(url, "_blank", "noopener");
    }
    return { ok: true, via: "manual", url };
  }

  /**
   * Envio genérico. Registra log/fila conforme o modo.
   * @returns {{ ok, erro?, via?, url?, filaId?, nome? }}
   */
  function enviar(state, { tipo, paraDiaconoId, paraNumero, texto, meta, abrirNoNavegador }) {
    ensure(state);
    const c = cfg(state);
    if (!c.ativo) {
      return { ok: false, erro: "Canal WhatsApp desativado nas configurações." };
    }

    let numero = normalizarNumero(paraNumero);
    let nome = "";
    if (paraDiaconoId) {
      const dest = whatsappDeDiacono(state, paraDiaconoId);
      if (!dest.ok) return dest;
      numero = dest.numero;
      nome = dest.diacono.nome;
    }
    if (!numeroValido(numero)) {
      return { ok: false, erro: "Número de WhatsApp inválido." };
    }
    if (!texto) return { ok: false, erro: "Mensagem vazia." };

    const payload = {
      tipo: tipo || "generico",
      numero,
      texto,
      meta: meta || {},
      portalLink: portalUrl(state, "?ir=avisos"),
      abrirNoNavegador: abrirNoNavegador ?? c.abrirNoNavegador,
    };

    if (c.modo === MODOS.api) {
      const fila = enfileirar(state, {
        ...payload,
        paraDiaconoId: paraDiaconoId || null,
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
      // Disparo assíncrono sem bloquear a UI (quando a API existir)
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

    const res = enviarManual(payload);
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

  /** Ponto de entrada usado pelas trocas */
  function notificarPedidoTroca(state, troca, { deNome } = {}) {
    ensure(state);
    const c = cfg(state);
    if (!c.ativo || !c.notificarPedidoTroca) {
      return { ok: false, erro: "Notificação de troca por WhatsApp está desligada.", ignorado: true };
    }
    const texto = montarMensagem(state, "pedido_troca", { troca, deNome });
    return enviar(state, {
      tipo: "pedido_troca",
      paraDiaconoId: troca.paraDiaconoId,
      texto,
      meta: { trocaId: troca.id, data: troca.data, modalidade: troca.modalidade },
    });
  }

  /** Credenciais de acesso ao criar usuário */
  function notificarCadastroUsuario(state, usuario, { senha } = {}) {
    ensure(state);
    const c = cfg(state);
    if (!c.ativo || c.notificarCadastroUsuario === false) {
      return { ok: false, erro: "Notificação de cadastro por WhatsApp está desligada.", ignorado: true };
    }
    return compartilharCredenciaisUsuario(state, usuario, { senha });
  }

  /** Compartilhar login/senha manualmente (botão na edição de usuário) */
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
      meta: { usuarioId: usuario.id, login: usuario.login, papel: usuario.papel, manual: true },
    });
  }

  /** Reservado: quando restrição for criada, notificar líderes (futuro) */
  function notificarAvisoRestricao(state, restricao, { diaconoNome } = {}) {
    ensure(state);
    const c = cfg(state);
    if (!c.ativo || !c.notificarRestricao) {
      return { ok: false, ignorado: true, erro: "Notificação de restrição desligada." };
    }
    const lideres = (state.lideres || []).filter((l) => l.ativo !== false && numeroValido(l.whatsapp));
    if (!lideres.length) {
      return { ok: false, erro: "Nenhum líder com WhatsApp cadastrado." };
    }
    const resultados = lideres.map((l) => {
      const texto = montarMensagem(state, "aviso_restricao", {
        nomeLider: l.nome,
        diaconoNome: diaconoNome || "",
        data: restricao.data,
        motivo: restricao.observacao || restricao.tipo,
      });
      return enviar(state, {
        tipo: "aviso_restricao",
        paraNumero: l.whatsapp,
        texto,
        meta: { restricaoId: restricao.id, liderId: l.id },
        abrirNoNavegador: c.modo === MODOS.manual && lideres.indexOf(l) === 0,
      });
    });
    return { ok: resultados.some((r) => r.ok), resultados };
  }

  /** Reprocessa itens pendentes da fila (modo api) */
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
    const com = lista.filter((d) => numeroValido(d.whatsapp)).length;
    return { total: lista.length, comWhatsapp: com, semWhatsapp: lista.length - com };
  }

  return {
    MODOS,
    cfgPadrao,
    cfg,
    ensure,
    normalizarNumero,
    numeroValido,
    whatsappDeDiacono,
    numeroDeUsuario,
    portalUrl,
    waMeUrl,
    montarMensagem,
    enviar,
    notificarPedidoTroca,
    notificarCadastroUsuario,
    compartilharCredenciaisUsuario,
    notificarAvisoRestricao,
    processarFila,
    resumoCadastro,
  };
})();
