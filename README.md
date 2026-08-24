# Diaconia — Escala Inteligente

Sistema da escala do diaconato (cultos, equipes, restrições, trocas).

## Rodar no seu computador

1. Abra o terminal nesta pasta.
2. Digite:
   ```bash
   npm install
   npm start
   ```
3. Abra o navegador em: http://localhost:3000

## Colocar na internet (Railway)

**Guia completo:** leia [`DEPLOY-RAILWAY.md`](DEPLOY-RAILWAY.md) nesta pasta.

Resumo:

1. Envie o código para o GitHub (push ou ZIP com `scripts/prepare-github-upload.ps1`).
2. Railway → **Connect Repo** → escolha o repositório.
3. **Settings → Networking → Generate Domain**.
4. Abra a URL e faça login.

O repositório Git local já está inicializado na branch `main`.

### Login (não aparece na tela)

| Papel | Login | Senha |
|-------|--------|--------|
| Líder | admin | admin123 |
| Diácono | felipe | felipe123 |

Troque as senhas depois em **Usuários** (líder) ou **Meu Perfil** (diácono).

## O que o sistema faz

- Gerar escala do **mês** ou **previsão do ano** (todos os domingos)
- Montar escala **manual**
- Usuários: adicionar / editar / excluir
- Histórico: filtrar, buscar, excluir, limpar
- Líderes: adicionar / editar / excluir (WhatsApp)
- Equipes: adicionar diácono, editar, mover
