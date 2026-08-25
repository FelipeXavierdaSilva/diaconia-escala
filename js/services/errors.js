/**
 * Relatos de erro — diáconos reportam; liderança acompanha e gera relatório.
 */
window.DiaconiaErrors = (() => {
  const Engine = () => window.DiaconiaEngine;
  const Hist = () => window.DiaconiaHistory;

  const AREAS = [
    { id: "escala", label: "Minha escala / calendário" },
    { id: "avisos", label: "Avisos / não posso ir" },
    { id: "troca", label: "Troca ou cobertura" },
    { id: "conta", label: "Minha conta / senha" },
    { id: "login", label: "Login / acesso" },
    { id: "whatsapp", label: "WhatsApp / compartilhamento" },
    { id: "outro", label: "Outro" },
  ];

  const STATUS = {
    aberto: { texto: "Aberto", tom: "warn" },
    em_analise: { texto: "Em análise", tom: "muted" },
    resolvido: { texto: "Resolvido", tom: "ok" },
    descartado: { texto: "Descartado", tom: "danger" },
  };

  function ensure(state) {
    if (!Array.isArray(state.relatosErro)) state.relatosErro = [];
    return state.relatosErro;
  }

  function areaLabel(id) {
    return AREAS.find((a) => a.id === id)?.label || id || "Outro";
  }

  function statusInfo(st) {
    return STATUS[st] || { texto: st || "—", tom: "muted" };
  }

  function criar(state, payload, sessao) {
    ensure(state);
    const titulo = String(payload.titulo || "").trim();
    const descricao = String(payload.descricao || "").trim();
    if (!titulo) return { ok: false, erro: "Informe um título curto do problema." };
    if (descricao.length < 8) {
      return { ok: false, erro: "Descreva o que aconteceu (pelo menos algumas palavras)." };
    }

    const relato = {
      id: Engine().uid("err"),
      titulo,
      descricao,
      area: payload.area || "outro",
      pagina: payload.pagina || null,
      status: "aberto",
      criadoEm: new Date().toISOString(),
      criadoPor: sessao?.usuarioId || null,
      criadoPorNome: sessao?.nome || "Usuário",
      criadoPorPapel: sessao?.papel || null,
      diaconoId: sessao?.diaconoId || null,
      tecnico: payload.tecnico || null,
      userAgent: typeof navigator !== "undefined" ? navigator.userAgent || "" : "",
      url: typeof location !== "undefined" ? `${location.origin || ""}${location.pathname || ""}` : "",
      resolvidoEm: null,
      resolvidoPor: null,
      notaAdmin: "",
    };

    state.relatosErro.unshift(relato);
    if (state.relatosErro.length > 300) state.relatosErro.length = 300;

    Hist().add(state, {
      tipo: "erro",
      mensagem: `Relato de erro: ${titulo} (${sessao?.nome || "usuário"}).`,
      usuarioId: sessao?.usuarioId,
      meta: { relatoId: relato.id },
    });

    for (const u of state.usuarios || []) {
      if (u.papel !== "lider") continue;
      Hist().notify(state, {
        usuarioId: u.id,
        titulo: "Novo relato de erro",
        corpo: `${sessao?.nome || "Alguém"} reportou: ${titulo}`,
        link: "?ir=erros",
        meta: { tipo: "relato_erro", relatoId: relato.id },
      });
    }

    return { ok: true, relato };
  }

  function atualizarStatus(state, id, { status, notaAdmin }, sessao) {
    ensure(state);
    const r = state.relatosErro.find((x) => x.id === id);
    if (!r) return { ok: false, erro: "Relato não encontrado." };
    if (!STATUS[status]) return { ok: false, erro: "Status inválido." };

    r.status = status;
    if (notaAdmin !== undefined) r.notaAdmin = String(notaAdmin || "").trim();
    if (status === "resolvido" || status === "descartado") {
      r.resolvidoEm = new Date().toISOString();
      r.resolvidoPor = sessao?.usuarioId || null;
    } else {
      r.resolvidoEm = null;
      r.resolvidoPor = null;
    }

    Hist().add(state, {
      tipo: "erro",
      mensagem: `Relato ${id} → ${STATUS[status].texto}.`,
      usuarioId: sessao?.usuarioId,
      meta: { relatoId: id, status },
    });

    if (r.criadoPor && (status === "resolvido" || status === "descartado" || status === "em_analise")) {
      Hist().notify(state, {
        usuarioId: r.criadoPor,
        titulo: status === "resolvido" ? "Seu relato foi resolvido" : status === "em_analise" ? "Relato em análise" : "Sobre seu relato",
        corpo:
          status === "resolvido"
            ? `Obrigado! O problema “${r.titulo}” foi marcado como resolvido.`
            : status === "em_analise"
              ? `A liderança está analisando: “${r.titulo}”.`
              : `O relato “${r.titulo}” foi encerrado pela liderança.`,
        link: "?ir=relatar",
        meta: { tipo: "relato_erro_status", relatoId: id },
      });
    }

    return { ok: true, relato: r };
  }

  function excluir(state, id, sessao) {
    ensure(state);
    const before = state.relatosErro.length;
    state.relatosErro = state.relatosErro.filter((x) => x.id !== id);
    if (state.relatosErro.length === before) return { ok: false, erro: "Relato não encontrado." };
    Hist().add(state, {
      tipo: "erro",
      mensagem: `Relato de erro excluído (${id}).`,
      usuarioId: sessao?.usuarioId,
    });
    return { ok: true };
  }

  function abertos(state) {
    return ensure(state).filter((r) => r.status === "aberto" || r.status === "em_analise");
  }

  function resumo(state) {
    const lista = ensure(state);
    const porStatus = { aberto: 0, em_analise: 0, resolvido: 0, descartado: 0 };
    const porArea = {};
    for (const r of lista) {
      porStatus[r.status] = (porStatus[r.status] || 0) + 1;
      const a = r.area || "outro";
      porArea[a] = (porArea[a] || 0) + 1;
    }
    return {
      total: lista.length,
      abertos: (porStatus.aberto || 0) + (porStatus.em_analise || 0),
      porStatus,
      porArea,
    };
  }

  function gerarRelatorioTexto(state, { apenasAbertos = false } = {}) {
    const lista = ensure(state)
      .filter((r) => (apenasAbertos ? r.status === "aberto" || r.status === "em_analise" : true))
      .slice()
      .sort((a, b) => String(b.criadoEm).localeCompare(String(a.criadoEm)));

    const igreja = state.configuracoes?.nomeIgreja || "Diaconia";
    const s = resumo(state);
    const linhas = [
      `RELATÓRIO DE ERROS — ${igreja}`,
      `Gerado em: ${new Date().toLocaleString("pt-BR")}`,
      `Total de relatos: ${s.total} | Abertos/em análise: ${s.abertos}`,
      `Abertos: ${s.porStatus.aberto || 0} · Em análise: ${s.porStatus.em_analise || 0} · Resolvidos: ${s.porStatus.resolvido || 0} · Descartados: ${s.porStatus.descartado || 0}`,
      "",
      "Por área:",
      ...AREAS.map((a) => `  - ${a.label}: ${s.porArea[a.id] || 0}`),
      "",
      "═".repeat(60),
      "",
    ];

    if (!lista.length) {
      linhas.push("(Nenhum relato neste filtro.)");
    } else {
      lista.forEach((r, i) => {
        const st = statusInfo(r.status).texto;
        linhas.push(`${i + 1}. [${st}] ${r.titulo}`);
        linhas.push(`   Área: ${areaLabel(r.area)}`);
        linhas.push(`   Quem: ${r.criadoPorNome || "—"} (${r.criadoPorPapel || "—"})`);
        linhas.push(`   Quando: ${r.criadoEm ? new Date(r.criadoEm).toLocaleString("pt-BR") : "—"}`);
        linhas.push(`   Descrição: ${r.descricao}`);
        if (r.notaAdmin) linhas.push(`   Nota da liderança: ${r.notaAdmin}`);
        if (r.pagina) linhas.push(`   Página: ${r.pagina}`);
        if (r.tecnico) linhas.push(`   Técnico: ${r.tecnico}`);
        linhas.push("");
      });
    }

    return linhas.join("\n");
  }

  function baixarRelatorio(state, opts = {}) {
    const texto = gerarRelatorioTexto(state, opts);
    const blob = new Blob([texto], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const stamp = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `relatorio-erros-diaconia-${stamp}.txt`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    return { ok: true, texto };
  }

  function imprimirRelatorio(state, opts = {}) {
    const texto = gerarRelatorioTexto(state, opts);
    const w = window.open("", "_blank", "noopener,noreferrer");
    if (!w) return { ok: false, erro: "Permita pop-ups para imprimir o relatório." };
    const esc = (s) =>
      String(s)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
    w.document.write(`<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"/><title>Relatório de erros</title>
      <style>body{font-family:system-ui,sans-serif;padding:24px;white-space:pre-wrap;line-height:1.45;color:#1a1a1a} h1{font-size:18px}</style>
      </head><body><h1>Relatório de erros</h1><pre>${esc(texto)}</pre>
      <script>window.onload=()=>{window.print()}<\/script></body></html>`);
    w.document.close();
    return { ok: true };
  }

  return {
    AREAS,
    STATUS,
    ensure,
    areaLabel,
    statusInfo,
    criar,
    atualizarStatus,
    excluir,
    abertos,
    resumo,
    gerarRelatorioTexto,
    baixarRelatorio,
    imprimirRelatorio,
  };
})();
