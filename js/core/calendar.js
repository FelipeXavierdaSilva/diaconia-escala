/**
 * Utilitários de calendário — ano real 2026.
 */
window.DiaconiaCalendar = (() => {
  const MESES = [
    "Janeiro",
    "Fevereiro",
    "Março",
    "Abril",
    "Maio",
    "Junho",
    "Julho",
    "Agosto",
    "Setembro",
    "Outubro",
    "Novembro",
    "Dezembro",
  ];

  const DIAS_SEMANA = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
  const DIAS_CURTOS = ["DOM", "SEG", "TER", "QUA", "QUI", "SEX", "SÁB"];

  function parseISO(iso) {
    const [y, m, d] = iso.split("-").map(Number);
    return new Date(y, m - 1, d);
  }

  function toISO(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  function formatBR(iso) {
    const [y, m, d] = iso.split("-");
    return `${d}/${m}/${y}`;
  }

  function formatBRCurto(iso) {
    const [y, m, d] = iso.split("-");
    return `${d}/${m}`;
  }

  function diaSemana(iso) {
    return DIAS_SEMANA[parseISO(iso).getDay()];
  }

  function nomeMes(mes) {
    return MESES[mes - 1];
  }

  function diasNoMes(ano, mes) {
    return new Date(ano, mes, 0).getDate();
  }

  /** Grade do calendário (células null = vazias) */
  function gradeMes(ano, mes) {
    const total = diasNoMes(ano, mes);
    const primeiro = new Date(ano, mes - 1, 1).getDay();
    const cells = [];
    for (let i = 0; i < primeiro; i++) cells.push(null);
    for (let d = 1; d <= total; d++) {
      cells.push(toISO(new Date(ano, mes - 1, d)));
    }
    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
  }

  function domingosDoMes(ano, mes) {
    const datas = [];
    const d = new Date(ano, mes - 1, 1);
    while (d.getMonth() === mes - 1) {
      if (d.getDay() === 0) datas.push(toISO(d));
      d.setDate(d.getDate() + 1);
    }
    return datas;
  }

  function escalasDoMes(state, ano, mes) {
    const prefix = `${ano}-${String(mes).padStart(2, "0")}`;
    return Object.values(state.escalas)
      .filter((e) => e.data.startsWith(prefix))
      .sort((a, b) => a.data.localeCompare(b.data));
  }

  function hojeISO() {
    return toISO(new Date());
  }

  function compararHorario(h1, h2) {
    if (!h1 || !h2) return 0;
    if (h1 === "Final") return 1;
    if (h2 === "Final") return -1;
    const [a1, b1] = h1.split(":").map(Number);
    const [a2, b2] = h2.split(":").map(Number);
    return a1 * 60 + b1 - (a2 * 60 + b2);
  }

  /** Retorna true se o diácono consegue chegar a tempo da função */
  function horarioCompativel(chegadaMax, horarioFuncao) {
    if (!chegadaMax || !horarioFuncao || horarioFuncao === "Final") return true;
    return compararHorario(chegadaMax, horarioFuncao) <= 0;
  }

  return {
    MESES,
    DIAS_SEMANA,
    DIAS_CURTOS,
    parseISO,
    toISO,
    formatBR,
    formatBRCurto,
    diaSemana,
    nomeMes,
    diasNoMes,
    gradeMes,
    domingosDoMes,
    escalasDoMes,
    hojeISO,
    compararHorario,
    horarioCompativel,
  };
})();
