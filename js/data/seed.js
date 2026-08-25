/**
 * DIACONIA — Dados iniciais (seed)
 * Separados da lógica para futura migração a backend.
 */
window.DiaconiaSeed = (() => {
  const FUNCOES = [
    {
      id: "lanche",
      nome: "Lanche dos pastores",
      emoji: "🥪",
      horario: "17:30",
      qtdPorEquipe: 1,
      instrucoes:
        "Preparar e servir o lanche dos pastores antes do culto. Chegar com antecedência, organizar a mesa e garantir água e utensílios.",
    },
    {
      id: "janta",
      nome: "Janta",
      emoji: "🍽️",
      horario: "18:00",
      qtdPorEquipe: 1,
      instrucoes:
        "Organizar e servir a janta conforme orientação da liderança. Manter o ambiente limpo e acolhedor.",
    },
    {
      id: "frente",
      nome: "Frente do Presbitério",
      emoji: "🪑",
      horario: "17:45",
      qtdPorEquipe: 1,
      instrucoes:
        "Organizar cadeiras e passagem na frente do presbitério. Manter o acesso livre e acolher com discrição.",
    },
    {
      id: "cadeiras",
      nome: "Cadeiras",
      emoji: "💺",
      horario: "17:30",
      qtdPorEquipe: 1,
      instrucoes:
        "Dispor cadeiras extras conforme a demanda. Chegar cedo e acompanhar até o início do culto.",
    },
    {
      id: "gazofilacio",
      nome: "Gazofilácio",
      emoji: "🧺",
      horario: "18:00",
      qtdPorEquipe: 1,
      instrucoes:
        "Responsável pela coleta. Manter postura reverente e acompanhar o momento da oferta.",
    },
    {
      id: "contar_oferta",
      nome: "Contar Oferta",
      emoji: "🔢",
      horario: "Final",
      qtdPorEquipe: 2,
      instrucoes:
        "Contar a oferta com pelo menos duas pessoas. Registrar e entregar conforme protocolo da igreja.",
    },
    {
      id: "louca",
      nome: "Louça",
      emoji: "🧼",
      horario: "18:00",
      qtdPorEquipe: 1,
      instrucoes:
        "Lavar e organizar a louça após o uso. Deixar a cozinha em ordem.",
    },
    {
      id: "intercessao",
      nome: "Intercessão",
      emoji: "🙏",
      horario: "17:45",
      qtdPorEquipe: 1,
      instrucoes:
        "Participar do momento de intercessão antes do culto. Manter coração e atitude de oração.",
    },
    {
      id: "seguranca",
      nome: "Segurança",
      emoji: "🥷",
      horario: "18:00",
      qtdPorEquipe: 2,
      instrucoes:
        "Circulação, portas e atenção ao ambiente. Apoiar visitantes e acionar a liderança se necessário.",
    },
    {
      id: "aconselhamento",
      nome: "Aconselhamento",
      emoji: "📖",
      horario: "18:00",
      qtdPorEquipe: 2,
      instrucoes:
        "Estar disponível para aconselhamento pastoral de apoio. Preferencialmente um casal cadastrado. Discrição, acolhimento e encaminhamento adequado.",
    },
    {
      id: "fechar_templo",
      nome: "Fechar templo",
      emoji: "🔐",
      horario: "Final",
      qtdPorEquipe: 2,
      instrucoes:
        "Verificar luzes, ar-condicionado, portas e segurança ao encerrar. Mínimo duas pessoas — preferencialmente um casal cadastrado.",
    },
    {
      id: "infantil",
      nome: "Infantil",
      emoji: "🧒",
      horario: "18:00",
      qtdPorEquipe: 1,
      instrucoes:
        "Apoiar o ministério infantil. Chegar no horário e seguir as orientações da equipe responsável.",
    },
    {
      id: "oracao_alinhamento",
      nome: "Oração/Alinhamento",
      emoji: "✨",
      horario: "17:30",
      qtdPorEquipe: 1,
      instrucoes:
        "Participar do alinhamento e oração da equipe antes do culto.",
    },
    {
      id: "oracao",
      nome: "Oração",
      emoji: "🛐",
      horario: "18:00",
      qtdPorEquipe: 1,
      instrucoes: "Estar disponível para oração com membros e visitantes.",
    },
    {
      id: "apoio_cantina",
      nome: "Apoio/Cantina",
      emoji: "☕",
      horario: "18:00",
      qtdPorEquipe: 2,
      instrucoes: "Apoiar a cantina e o atendimento após o culto.",
    },
    {
      id: "mesa_ceia",
      nome: "Mesa de Ceia",
      emoji: "🍞",
      horario: "17:45",
      qtdPorEquipe: 2,
      recorrencia: "primeiro_domingo",
      instrucoes:
        "Preparar a mesa da ceia com reverência. Conferir utensílios e organização. Em geral no 1º domingo do mês (pode alterar no culto).",
    },
  ];

  for (const f of FUNCOES) {
    if (f.ativo === undefined) f.ativo = true;
    if (f.recorrencia === undefined) f.recorrencia = "sempre";
  }

  /** Conjunto padrão (filtrado por recorrência na criação de cada culto) */
  const FUNCOES_PADRAO_CULTO = [
    "lanche",
    "janta",
    "frente",
    "cadeiras",
    "gazofilacio",
    "contar_oferta",
    "louca",
    "intercessao",
    "seguranca",
    "aconselhamento",
    "fechar_templo",
    "mesa_ceia",
  ];

  const diaconos = [
    { id: "d01", nome: "Felipe", equipeId: "eq01", funcaoMinisterio: "", funcaoDiaconatoId: "", whatsapp: "", restricaoPessoal: "", casado: false, conjugeNome: "", conjugeMembroIgreja: false, temFilhos: false, qtdFilhos: 0, filhos: [], filhosNomes: [], filhosVaoIgreja: false, funcoesPermitidas: ["*"], ativo: true },
    { id: "d02", nome: "Helenita", equipeId: "eq01", funcaoMinisterio: "", funcaoDiaconatoId: "", whatsapp: "", restricaoPessoal: "", casado: false, conjugeNome: "", conjugeMembroIgreja: false, temFilhos: false, qtdFilhos: 0, filhos: [], filhosNomes: [], filhosVaoIgreja: false, funcoesPermitidas: ["*"], ativo: true },
    { id: "d03", nome: "David", equipeId: "eq01", funcaoMinisterio: "", funcaoDiaconatoId: "", whatsapp: "", restricaoPessoal: "", casado: false, conjugeNome: "", conjugeMembroIgreja: false, temFilhos: false, qtdFilhos: 0, filhos: [], filhosNomes: [], filhosVaoIgreja: false, funcoesPermitidas: ["*"], ativo: true },
    { id: "d04", nome: "Kênia", equipeId: "eq01", funcaoMinisterio: "", funcaoDiaconatoId: "", whatsapp: "", restricaoPessoal: "", casado: false, conjugeNome: "", conjugeMembroIgreja: false, temFilhos: false, qtdFilhos: 0, filhos: [], filhosNomes: [], filhosVaoIgreja: false, funcoesPermitidas: ["*"], ativo: true },
    { id: "d05", nome: "Luis", equipeId: "eq01", funcaoMinisterio: "", funcaoDiaconatoId: "", whatsapp: "", restricaoPessoal: "", casado: false, conjugeNome: "", conjugeMembroIgreja: false, temFilhos: false, qtdFilhos: 0, filhos: [], filhosNomes: [], filhosVaoIgreja: false, funcoesPermitidas: ["*"], ativo: true },
    { id: "d06", nome: "Ana Paula", equipeId: "eq01", funcaoMinisterio: "", funcaoDiaconatoId: "", whatsapp: "", restricaoPessoal: "", casado: false, conjugeNome: "", conjugeMembroIgreja: false, temFilhos: false, qtdFilhos: 0, filhos: [], filhosNomes: [], filhosVaoIgreja: false, funcoesPermitidas: ["*"], ativo: true },
    { id: "d07", nome: "Carlos", equipeId: "eq01", funcaoMinisterio: "", funcaoDiaconatoId: "", whatsapp: "", restricaoPessoal: "", casado: false, conjugeNome: "", conjugeMembroIgreja: false, temFilhos: false, qtdFilhos: 0, filhos: [], filhosNomes: [], filhosVaoIgreja: false, funcoesPermitidas: ["*"], ativo: true },
    { id: "d08", nome: "Mariana", equipeId: "eq01", funcaoMinisterio: "", funcaoDiaconatoId: "", whatsapp: "", restricaoPessoal: "", casado: false, conjugeNome: "", conjugeMembroIgreja: false, temFilhos: false, qtdFilhos: 0, filhos: [], filhosNomes: [], filhosVaoIgreja: false, funcoesPermitidas: ["*"], ativo: true },
    { id: "d09", nome: "Roberto", equipeId: "eq01", funcaoMinisterio: "", funcaoDiaconatoId: "", whatsapp: "", restricaoPessoal: "", casado: false, conjugeNome: "", conjugeMembroIgreja: false, temFilhos: false, qtdFilhos: 0, filhos: [], filhosNomes: [], filhosVaoIgreja: false, funcoesPermitidas: ["*"], ativo: true },
    { id: "d10", nome: "Juliana", equipeId: "eq01", funcaoMinisterio: "", funcaoDiaconatoId: "", whatsapp: "", restricaoPessoal: "", casado: false, conjugeNome: "", conjugeMembroIgreja: false, temFilhos: false, qtdFilhos: 0, filhos: [], filhosNomes: [], filhosVaoIgreja: false, funcoesPermitidas: ["*"], ativo: true },
    { id: "d11", nome: "Pedro", equipeId: "eq01", funcaoMinisterio: "", funcaoDiaconatoId: "", whatsapp: "", restricaoPessoal: "", casado: false, conjugeNome: "", conjugeMembroIgreja: false, temFilhos: false, qtdFilhos: 0, filhos: [], filhosNomes: [], filhosVaoIgreja: false, funcoesPermitidas: ["*"], ativo: true },
    { id: "d12", nome: "Sofia", equipeId: "eq01", funcaoMinisterio: "", funcaoDiaconatoId: "", whatsapp: "", restricaoPessoal: "", casado: false, conjugeNome: "", conjugeMembroIgreja: false, temFilhos: false, qtdFilhos: 0, filhos: [], filhosNomes: [], filhosVaoIgreja: false, funcoesPermitidas: ["*"], ativo: true },
    { id: "d13", nome: "André", equipeId: "eq02", funcaoMinisterio: "", funcaoDiaconatoId: "", whatsapp: "", restricaoPessoal: "", casado: false, conjugeNome: "", conjugeMembroIgreja: false, temFilhos: false, qtdFilhos: 0, filhos: [], filhosNomes: [], filhosVaoIgreja: false, funcoesPermitidas: ["*"], ativo: true },
    { id: "d14", nome: "Beatriz", equipeId: "eq02", funcaoMinisterio: "", funcaoDiaconatoId: "", whatsapp: "", restricaoPessoal: "", casado: false, conjugeNome: "", conjugeMembroIgreja: false, temFilhos: false, qtdFilhos: 0, filhos: [], filhosNomes: [], filhosVaoIgreja: false, funcoesPermitidas: ["*"], ativo: true },
    { id: "d15", nome: "Daniel", equipeId: "eq02", funcaoMinisterio: "", funcaoDiaconatoId: "", whatsapp: "", restricaoPessoal: "", casado: false, conjugeNome: "", conjugeMembroIgreja: false, temFilhos: false, qtdFilhos: 0, filhos: [], filhosNomes: [], filhosVaoIgreja: false, funcoesPermitidas: ["*"], ativo: true },
    { id: "d16", nome: "Eliane", equipeId: "eq02", funcaoMinisterio: "", funcaoDiaconatoId: "", whatsapp: "", restricaoPessoal: "", casado: false, conjugeNome: "", conjugeMembroIgreja: false, temFilhos: false, qtdFilhos: 0, filhos: [], filhosNomes: [], filhosVaoIgreja: false, funcoesPermitidas: ["*"], ativo: true },
    { id: "d17", nome: "Fernando", equipeId: "eq02", funcaoMinisterio: "", funcaoDiaconatoId: "", whatsapp: "", restricaoPessoal: "", casado: false, conjugeNome: "", conjugeMembroIgreja: false, temFilhos: false, qtdFilhos: 0, filhos: [], filhosNomes: [], filhosVaoIgreja: false, funcoesPermitidas: ["*"], ativo: true },
    { id: "d18", nome: "Gabriela", equipeId: "eq02", funcaoMinisterio: "", funcaoDiaconatoId: "", whatsapp: "", restricaoPessoal: "", casado: false, conjugeNome: "", conjugeMembroIgreja: false, temFilhos: false, qtdFilhos: 0, filhos: [], filhosNomes: [], filhosVaoIgreja: false, funcoesPermitidas: ["*"], ativo: true },
    { id: "d19", nome: "Henrique", equipeId: "eq02", funcaoMinisterio: "", funcaoDiaconatoId: "", whatsapp: "", restricaoPessoal: "", casado: false, conjugeNome: "", conjugeMembroIgreja: false, temFilhos: false, qtdFilhos: 0, filhos: [], filhosNomes: [], filhosVaoIgreja: false, funcoesPermitidas: ["*"], ativo: true },
    { id: "d20", nome: "Isabela", equipeId: "eq02", funcaoMinisterio: "", funcaoDiaconatoId: "", whatsapp: "", restricaoPessoal: "", casado: false, conjugeNome: "", conjugeMembroIgreja: false, temFilhos: false, qtdFilhos: 0, filhos: [], filhosNomes: [], filhosVaoIgreja: false, funcoesPermitidas: ["*"], ativo: true },
    { id: "d21", nome: "João", equipeId: "eq02", funcaoMinisterio: "", funcaoDiaconatoId: "", whatsapp: "", restricaoPessoal: "", casado: false, conjugeNome: "", conjugeMembroIgreja: false, temFilhos: false, qtdFilhos: 0, filhos: [], filhosNomes: [], filhosVaoIgreja: false, funcoesPermitidas: ["*"], ativo: true },
    { id: "d22", nome: "Larissa", equipeId: "eq02", funcaoMinisterio: "", funcaoDiaconatoId: "", whatsapp: "", restricaoPessoal: "", casado: false, conjugeNome: "", conjugeMembroIgreja: false, temFilhos: false, qtdFilhos: 0, filhos: [], filhosNomes: [], filhosVaoIgreja: false, funcoesPermitidas: ["*"], ativo: true },
    { id: "d23", nome: "Marcos", equipeId: "eq02", funcaoMinisterio: "", funcaoDiaconatoId: "", whatsapp: "", restricaoPessoal: "", casado: false, conjugeNome: "", conjugeMembroIgreja: false, temFilhos: false, qtdFilhos: 0, filhos: [], filhosNomes: [], filhosVaoIgreja: false, funcoesPermitidas: ["*"], ativo: true },
    { id: "d24", nome: "Natália", equipeId: "eq02", funcaoMinisterio: "", funcaoDiaconatoId: "", whatsapp: "", restricaoPessoal: "", casado: false, conjugeNome: "", conjugeMembroIgreja: false, temFilhos: false, qtdFilhos: 0, filhos: [], filhosNomes: [], filhosVaoIgreja: false, funcoesPermitidas: ["*"], ativo: true },
  ];

  const equipes = [
    { id: "eq01", nome: "Equipe 01", nomeDefinido: false, ativa: true },
    { id: "eq02", nome: "Equipe 02", nomeDefinido: false, ativa: true },
  ];

  /** Ministérios da igreja (horários ajudam a gerar a escala da diaconia). */
  const ministerios = [
    {
      id: "min_infantil",
      nome: "Infantil",
      horarioInicio: "18:00",
      horarioFim: "21:00",
      ativo: true,
    },
    {
      id: "min_louvor",
      nome: "Louvor",
      horarioInicio: "17:45",
      horarioFim: "21:00",
      ativo: true,
    },
    {
      id: "min_recepcao",
      nome: "Recepção",
      horarioInicio: "17:30",
      horarioFim: "19:00",
      ativo: true,
    },
  ];

  /** Casais: preferir mesmo dia ≠ obrigar mesma função */
  const casais = [
    {
      id: "c01",
      diaconoIdA: "d01",
      diaconoIdB: "d02",
      preferirMesmoDia: true,
      preferirMesmaFuncao: false,
      naoServirJuntos: false,
      ativo: true,
      observacao: "Felipe e Helenita — preferem servir no mesmo culto, funções podem ser diferentes.",
    },
    {
      id: "c02",
      diaconoIdA: "d03",
      diaconoIdB: "d04",
      preferirMesmoDia: true,
      preferirMesmaFuncao: false,
      naoServirJuntos: false,
      ativo: true,
      observacao: "David e Kênia",
    },
  ];

  const lideres = [
    { id: "l01", nome: "Líder 1", whatsapp: "5511999990001", ativo: true, apareceEmDiaconos: true },
    { id: "l02", nome: "Líder 2", whatsapp: "5511999990002", ativo: true, apareceEmDiaconos: true },
    { id: "l03", nome: "Líder 3", whatsapp: "5511999990003", ativo: true, apareceEmDiaconos: true },
    { id: "l04", nome: "Líder 4", whatsapp: "5511999990004", ativo: true, apareceEmDiaconos: true },
  ];

  const usuarios = [
    {
      id: "u_admin",
      login: "admin",
      senha: "admin123",
      nome: "Administrador",
      papel: "lider",
      diaconoId: null,
    },
    {
      id: "u_felipe",
      login: "felipe",
      senha: "felipe123",
      nome: "Felipe",
      papel: "diacono",
      diaconoId: "d01",
    },
    {
      id: "u_helenita",
      login: "helenita",
      senha: "helenita123",
      nome: "Helenita",
      papel: "diacono",
      diaconoId: "d02",
    },
    {
      id: "u_andre",
      login: "andre",
      senha: "andre123",
      nome: "André",
      papel: "diacono",
      diaconoId: "d13",
    },
  ];

  /** Domingos reais de agosto/2026 e demais meses úteis para demo */
  function domingosDoMes(ano, mes) {
    const datas = [];
    const d = new Date(ano, mes - 1, 1);
    while (d.getMonth() === mes - 1) {
      if (d.getDay() === 0) {
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, "0");
        const day = String(d.getDate()).padStart(2, "0");
        datas.push(`${y}-${m}-${day}`);
      }
      d.setDate(d.getDate() + 1);
    }
    return datas;
  }

  function criarEscalaBase(
    data,
    tipo = "culto",
    nome = "Culto",
    horario = "18:00",
    equipesIds = null,
    funcoesIds = null
  ) {
    return {
      id: `esc_${data}`,
      data,
      tipo,
      nome,
      horario,
      /** Uma equipe responsável por este dia (padrão do sistema) */
      equipesIds: equipesIds && equipesIds.length ? [...equipesIds] : ["eq01"],
      funcoesIds: funcoesIds?.length ? [...funcoesIds] : [...FUNCOES_PADRAO_CULTO],
      status: "rascunho",
      atribuicoes: {},
      problemas: [],
      publicada: false,
      gerada: false,
    };
  }

  /** Alterna equipes ativas ao longo das datas (dia X → Equipe 1, próximo → Equipe 2…) */
  function atribuirEquipesPorDia(datas, equipesAtivas = ["eq01", "eq02"]) {
    const mapa = {};
    const eqs = equipesAtivas.length ? equipesAtivas : ["eq01"];
    datas.forEach((data, i) => {
      mapa[data] = [eqs[i % eqs.length]];
    });
    return mapa;
  }

  function build() {
    const escalas = {};
    const ano = 2026;
    const todasDatas = [];
    for (let mes = 1; mes <= 12; mes++) {
      for (const data of domingosDoMes(ano, mes)) todasDatas.push(data);
    }
    const porDia = atribuirEquipesPorDia(todasDatas, equipes.filter((e) => e.ativa).map((e) => e.id));
    for (const data of todasDatas) {
      const fids = FUNCOES_PADRAO_CULTO.filter((id) => {
        const f = FUNCOES.find((x) => x.id === id);
        if (!f || f.ativo === false) return false;
        const r = f.recorrencia || "sempre";
        if (r === "sempre") return true;
        const [y, m] = data.split("-").map(Number);
        const doms = domingosDoMes(y, m);
        const idx = doms.indexOf(data) + 1;
        if (r === "primeiro_domingo") return idx === 1;
        if (r === "segundo_domingo") return idx === 2;
        if (r === "terceiro_domingo") return idx === 3;
        if (r === "quarto_domingo") return idx === 4;
        if (r === "ultimo_domingo") return idx === doms.length;
        return true;
      });
      escalas[data] = criarEscalaBase(data, "culto", "Culto", "18:00", porDia[data], fids);
    }

    return {
      meta: {
        versao: 2,
        anoPadrao: 2026,
        mesAtual: 8,
        modeloEquipePorDia: true,
        criadoEm: new Date().toISOString(),
      },
      funcoes: FUNCOES,
      funcoesPadraoCulto: FUNCOES_PADRAO_CULTO,
      ministerios,
      equipes,
      diaconos,
      casais,
      lideres,
      usuarios,
      escalas,
      restricoes: [],
      trocas: [],
      historico: [
        {
          id: "h0",
          tipo: "sistema",
          mensagem: "Sistema inicializado com calendário 2026 (1 equipe por dia).",
          em: new Date().toISOString(),
          usuarioId: null,
        },
      ],
      notificacoes: [],
      whatsappFila: [],
      whatsappLog: [],
      comunicados: [],
      configuracoes: {
        nomeIgreja: "Diaconia Viva",
        horarioPadrao: "18:00",
        exigirAprovacaoRestricao: true,
        exigirAprovacaoTroca: false,
        respeitarCasais: true,
        umaEquipePorDia: true,
        whatsapp: {
          ativo: true,
          modo: "manual",
          abrirDireto: false,
          abrirNoNavegador: false,
          notificarPedidoTroca: true,
          notificarRespostaTroca: true,
          notificarCadastroUsuario: true,
          notificarRestricao: true,
          notificarStatusRestricao: true,
          notificarEscalaGerada: false,
          portalBaseUrl: "",
          apiUrl: "",
          apiToken: "",
        },
        geracao: {
          variarFuncoesNoMes: true,
          evitarMesmaFuncaoConsecutiva: true,
          embaralharOrdemFuncoes: true,
          equilibrarParticipacao: true,
          maxEscalasPorDiaconoNoMes: 0,
          maxPessoasPorCulto: 0,
          maxPessoasPorEvento: 0,
          permitirAcumularFuncoes: true,
          respeitarHorarioMinisterio: true,
          priorizarSemMinisterio: true,
          funcoesExigemCasal: ["aconselhamento", "fechar_templo"],
        },
      },
    };
  }

  return { build, FUNCOES, FUNCOES_PADRAO_CULTO, criarEscalaBase, domingosDoMes, atribuirEquipesPorDia };
})();
