/**
 * Aniversários — datas de nascimento e avisos (liderança + tarja opcional do diácono).
 */
window.DiaconiaAniversarios = (() => {
  const Cal = () => window.DiaconiaCalendar;
  const Hist = () => window.DiaconiaHistory;
  const PREFIX_COM = "aniv_auto_";

  function ensureCfg(state) {
    if (!state.configuracoes) state.configuracoes = {};
    if (!state.configuracoes.aniversarios) {
      state.configuracoes.aniversarios = {
        avisarLider: true,
        publicarParaEquipe: false,
      };
    }
    const a = state.configuracoes.aniversarios;
    if (a.avisarLider === undefined) a.avisarLider = true;
    if (a.publicarParaEquipe === undefined) a.publicarParaEquipe = false;
    if (!state.meta) state.meta = {};
    if (!state.meta.aniversariosProcessadosEm) state.meta.aniversariosProcessadosEm = "";
    return a;
  }

  function normalizarDataNascimento(val) {
    const s = String(val || "").trim();
    if (!s) return "";
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    return "";
  }

  function mesDia(iso) {
    const s = normalizarDataNascimento(iso);
    return s ? s.slice(5, 10) : null;
  }

  function idadeDe(iso, ref = null) {
    const s = normalizarDataNascimento(iso);
    if (!s) return null;
    const hoje = ref || Cal()?.hojeISO?.() || new Date().toISOString().slice(0, 10);
    const [y, m, d] = s.split("-").map(Number);
    const [yh, mh, dh] = hoje.split("-").map(Number);
    let idade = yh - y;
    if (mh < m || (mh === m && dh < d)) idade -= 1;
    return idade >= 0 && idade <= 130 ? idade : null;
  }

  function formatarData(iso) {
    const s = normalizarDataNascimento(iso);
    if (!s) return "";
    return Cal()?.formatBR?.(s) || s.split("-").reverse().join("/");
  }

  function filhosDo(d) {
    if (Array.isArray(d?.filhos) && d.filhos.length) return d.filhos;
    return (d?.filhosNomes || [])
      .map((n) => String(n || "").trim())
      .filter(Boolean)
      .map((nome) => ({ nome, dataNascimento: "", idade: null }));
  }

  function coletarAniversariosHoje(state) {
    const hoje = Cal().hojeISO();
    const md = hoje.slice(5, 10);
    const diaconos = [];
    const familia = [];

    for (const d of state.diaconos || []) {
      if (d.ativo === false) continue;
      if (mesDia(d.dataNascimento) === md) {
        diaconos.push({
          tipo: "diacono",
          nome: d.nome,
          diaconoId: d.id,
          idade: idadeDe(d.dataNascimento, hoje),
        });
      }
      if (d.casado && d.conjugeNome && mesDia(d.conjugeDataNascimento) === md) {
        familia.push({
          tipo: "conjuge",
          nome: d.conjugeNome,
          deDiacono: d.nome,
          diaconoId: d.id,
          idade: idadeDe(d.conjugeDataNascimento, hoje),
        });
      }
      for (const f of filhosDo(d)) {
        if (!f.nome || mesDia(f.dataNascimento) !== md) continue;
        familia.push({
          tipo: "filho",
          nome: f.nome,
          deDiacono: d.nome,
          diaconoId: d.id,
          idade: idadeDe(f.dataNascimento, hoje),
        });
      }
    }

    return { hoje, diaconos, familia, total: diaconos.length + familia.length };
  }

  function textoTarjaDiaconos(diaconos) {
    if (!diaconos.length) return "";
    const nomes = diaconos.map((x) => x.nome).filter(Boolean);
    if (nomes.length === 1) return `🎂 Aniversário hoje: ${nomes[0]}`;
    return `🎂 Aniversários hoje: ${nomes.join(", ")}`;
  }

  function textoNotificacaoLider({ diaconos, familia }) {
    const partes = [];
    for (const x of diaconos) {
      const idade = x.idade != null ? ` (${x.idade} anos)` : "";
      partes.push(`Diácono ${x.nome}${idade}`);
    }
    for (const x of familia) {
      const idade = x.idade != null ? ` (${x.idade} anos)` : "";
      if (x.tipo === "conjuge") partes.push(`Cônjuge de ${x.deDiacono}: ${x.nome}${idade}`);
      else partes.push(`Filho(a) de ${x.deDiacono}: ${x.nome}${idade}`);
    }
    return partes.join(" · ");
  }

  function limparComunicadosAntigos(state, hoje) {
    const idHoje = `${PREFIX_COM}${hoje}`;
    state.comunicados = (state.comunicados || []).filter(
      (c) => !String(c.id || "").startsWith(PREFIX_COM) || c.id === idHoje
    );
  }

  function sincronizar(state) {
    ensureCfg(state);
    const cfg = state.configuracoes.aniversarios;
    const info = coletarAniversariosHoje(state);
    const { hoje, diaconos, familia } = info;
    let dirty = false;

    limparComunicadosAntigos(state, hoje);
    const idCom = `${PREFIX_COM}${hoje}`;
    if (!Array.isArray(state.comunicados)) state.comunicados = [];

    if (cfg.publicarParaEquipe && diaconos.length) {
      const texto = textoTarjaDiaconos(diaconos);
      let com = state.comunicados.find((c) => c.id === idCom);
      if (!com) {
        state.comunicados.unshift({
          id: idCom,
          texto,
          ativo: true,
          auto: true,
          tipo: "aniversario",
          em: new Date().toISOString(),
        });
        dirty = true;
      } else if (com.texto !== texto || com.ativo === false) {
        com.texto = texto;
        com.ativo = true;
        dirty = true;
      }
    } else {
      const com = state.comunicados.find((c) => c.id === idCom);
      if (com?.ativo !== false) {
        if (com) com.ativo = false;
        dirty = !!com;
      }
    }

    if (cfg.avisarLider && info.total > 0 && state.meta.aniversariosProcessadosEm !== hoje) {
      state.meta.aniversariosProcessadosEm = hoje;
      dirty = true;
      const corpo = textoNotificacaoLider({ diaconos, familia });
      const titulo =
        diaconos.length === 1 && !familia.length
          ? `Aniversário: ${diaconos[0].nome}`
          : `Aniversários de hoje (${info.total})`;
      for (const u of state.usuarios || []) {
        if (u.papel !== "lider") continue;
        Hist()?.notify?.(state, {
          usuarioId: u.id,
          titulo,
          corpo,
          link: "?ir=diaconos",
          meta: { tipo: "aniversario", data: hoje },
        });
      }
    }

    return { ...info, dirty };
  }

  function resumoHojeHtml(state) {
    const { diaconos, familia, total } = coletarAniversariosHoje(state);
    if (!total) {
      return `<p class="muted" style="margin:0;font-size:13px">Nenhum aniversário cadastrado para hoje.</p>`;
    }
    const linhas = [];
    for (const x of diaconos) {
      linhas.push(`<li><strong>${x.nome}</strong> — diácono${x.idade != null ? ` (${x.idade} anos)` : ""}</li>`);
    }
    for (const x of familia) {
      const rotulo = x.tipo === "conjuge" ? `cônjuge de ${x.deDiacono}` : `filho(a) de ${x.deDiacono}`;
      linhas.push(`<li><strong>${x.nome}</strong> — ${rotulo}${x.idade != null ? ` (${x.idade} anos)` : ""}</li>`);
    }
    return `<ul class="preview-list" style="margin:0">${linhas.join("")}</ul>`;
  }

  return {
    ensureCfg,
    normalizarDataNascimento,
    mesDia,
    idadeDe,
    formatarData,
    coletarAniversariosHoje,
    sincronizar,
    resumoHojeHtml,
  };
})();
