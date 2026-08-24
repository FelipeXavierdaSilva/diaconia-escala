/**
 * Autenticação local (preparada para backend).
 */
window.DiaconiaAuth = (() => {
  const SESSION_KEY = "diaconia_sessao_v1";

  function login(login, senha, state) {
    const user = state.usuarios.find(
      (u) => u.login.toLowerCase() === String(login).toLowerCase() && u.senha === senha
    );
    if (!user) return { ok: false, erro: "Login ou senha inválidos." };
    const sessao = {
      usuarioId: user.id,
      papel: user.papel,
      diaconoId: user.diaconoId,
      nome: user.nome,
      em: new Date().toISOString(),
    };
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(sessao));
    return { ok: true, sessao };
  }

  function logout() {
    sessionStorage.removeItem(SESSION_KEY);
  }

  function sessao() {
    try {
      const raw = sessionStorage.getItem(SESSION_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  function requireAuth() {
    return !!sessao();
  }

  function isLider() {
    const s = sessao();
    return s && s.papel === "lider";
  }

  function isDiacono() {
    const s = sessao();
    return s && s.papel === "diacono";
  }

  /** Atualiza campos da sessão ativa (ex.: nome após editar perfil) */
  function atualizarSessao(patch = {}) {
    const s = sessao();
    if (!s) return null;
    const next = { ...s, ...patch };
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(next));
    return next;
  }

  return { login, logout, sessao, requireAuth, isLider, isDiacono, atualizarSessao };
})();
