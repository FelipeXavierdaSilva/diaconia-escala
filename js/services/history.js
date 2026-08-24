window.DiaconiaHistory = (() => {
  function add(state, { tipo, mensagem, usuarioId = null, meta = null }) {
    state.historico = state.historico || [];
    state.historico.unshift({
      id: window.DiaconiaEngine.uid("h"),
      tipo,
      mensagem,
      meta,
      usuarioId,
      em: new Date().toISOString(),
    });
    if (state.historico.length > 500) state.historico.length = 500;
  }

  function remove(state, id) {
    state.historico = (state.historico || []).filter((h) => h.id !== id);
  }

  function clear(state) {
    state.historico = [];
  }

  function notify(state, { usuarioId, titulo, corpo, link = null, meta = null }) {
    state.notificacoes = state.notificacoes || [];
    state.notificacoes.unshift({
      id: window.DiaconiaEngine.uid("n"),
      usuarioId,
      titulo,
      corpo,
      link,
      meta,
      lida: false,
      em: new Date().toISOString(),
    });
  }

  return { add, remove, clear, notify };
})();
