<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/960bac0b-8a59-4b72-991c-46bb1a2b7a76

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. (Opcional) Set the `GEMINI_API_KEY` in [.env.local](.env.local) se voce usar recursos do Gemini
3. Run the app:
   `npm run dev`

## Deploy no Firebase Hosting com GitHub Actions

Arquivos de deploy adicionados no projeto:

- `firebase.json`
- `.firebaserc`
- `.github/workflows/firebase-hosting.yml`

### 1) Defina o project id do Firebase

No arquivo `.firebaserc`, troque `SEU_FIREBASE_PROJECT_ID` pelo ID real do seu projeto Firebase.

### 2) Crie uma Service Account para deploy

No Google Cloud Console do projeto Firebase:

1. Acesse IAM e Admin > Service Accounts
2. Crie (ou use) uma conta de servico para CI
3. Dê permissao de Firebase Hosting Admin (ou Editor, se preferir)
4. Gere uma chave JSON e copie o conteudo

### 3) Configure secrets e variable no GitHub

No repositorio GitHub, adicione:

- Secret: `FIREBASE_SERVICE_ACCOUNT` com o JSON completo da service account
- Variable: `FIREBASE_PROJECT_ID` com o ID do projeto Firebase

### 4) Fluxo automatico

- Push para `main`: faz build e deploy em producao (canal `live`)
- Pull request: faz build e cria preview channel no Firebase Hosting

### 5) Primeiro deploy local opcional

Se quiser validar antes do CI:

1. `npm run build`
2. `npx firebase-tools deploy --only hosting`
