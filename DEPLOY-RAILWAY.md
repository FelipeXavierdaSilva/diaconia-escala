# Deploy no Railway — checklist rápido

## Já preparado neste projeto

- [x] `server.js` — Express + API `/api/state` + arquivos estáticos
- [x] `railway.toml` — start `npm start`, health check `/health`
- [x] `.gitignore` — ignora `node_modules`, `data/state.json`, `.env`
- [x] Repositório Git local (`main`)

## Opção A — Git push (recomendado)

### 1. Criar repositório no GitHub

1. Acesse https://github.com/new
2. Nome: `diaconia-escala`
3. **Private** → Create repository
4. **Não** marque README/gitignore (já existem aqui)

### 2. Enviar o código

No terminal, na pasta do projeto:

```powershell
& "C:\Program Files\Git\bin\git.exe" remote add origin https://github.com/SEU_USUARIO/diaconia-escala.git
& "C:\Program Files\Git\bin\git.exe" push -u origin main
```

(GitHub vai pedir login — use token ou GitHub Desktop.)

### 3. Railway

1. https://railway.com → seu projeto
2. Serviço → **Settings** → **Connect Repo** → escolha `diaconia-escala`
3. **Root Directory:** `/`
4. Aguarde deploy verde (aba **Deployments**)
5. **Settings** → **Networking** → **Generate Domain**
6. Abra a URL gerada

### 4. Testar

- `https://SEU-DOMINIO.up.railway.app/health` → `{"ok":true,...}`
- Login líder: `admin` / `admin123`
- Login diácono: `felipe` / `felipe123`

---

## Opção B — Upload manual (sem push)

1. Rode na pasta do projeto:

   ```powershell
   powershell -ExecutionPolicy Bypass -File scripts\prepare-github-upload.ps1
   ```

2. Será criado `diaconia-deploy.zip` na raiz.
3. GitHub → New repo → **uploading an existing file** → extraia o ZIP e envie os arquivos (ou envie pasta por pasta).
4. Railway → **Connect Repo** → **Generate Domain** (mesmo fluxo acima).

---

## Depois do deploy

- Troque senhas em **Usuários** (líder).
- Cada `git push` na branch `main` pode redeployar automaticamente.
- Dados ficam em `data/state.json` no servidor Railway (todos compartilham o mesmo estado).

## Problemas comuns

| Sintoma | Solução |
|---------|---------|
| Deploy falha | Aba Deployments → logs; confirme `package.json` e `server.js` no repo |
| Health check falha | Servidor precisa ouvir `process.env.PORT` (já configurado) |
| Página em branco | Abra `/health`; se OK, limpe cache (Ctrl+F5) |
| Dados sumiram | Normal na 1ª vez — seed inicial; dados persistem no volume do Railway |
