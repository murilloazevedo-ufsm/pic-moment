# Pic Moments - Casamento Inara e Lucas

Aplicação web simples para coleta de fotos em casamento via QR Code na mesa.

## Estrutura de pastas

```text
pic-moments/
├── package.json
├── server.js
├── public/
│   ├── index.html
│   ├── styles.css
│   └── app.js
├── .env.example
└── README.md
```

## Requisitos

- Node.js 18+
- Conta Google Cloud com projeto habilitado
- Service Account com acesso ao Google Drive
- Pasta do Drive compartilhada com o e-mail da Service Account
- Credenciais em variável de ambiente

## Backend

O backend usa Express, Multer e Google APIs para receber `multipart/form-data` e enviar cada imagem para uma pasta do Google Drive.

O endpoint principal é:

```text
POST /api/upload
```

Formato:

```text
Content-Type: multipart/form-data
```

Campo:

```text
photos
```

## Frontend

A página única oferece:

- `input` com `accept="image/*"` e `multiple`
- Limite de 15 fotos por envio no cliente
- Barra de progresso real
- Mensagem de sucesso/erro
- Layout responsivo para mobile

## Google Cloud Console

### 1. Criar projeto

1. Acesse https://console.cloud.google.com/
2. Crie ou selecione um projeto.
3. Ative a API do Google Drive.

### 2. Criar Service Account

1. Navegue para `IAM & Admin > Service Accounts`
2. Clique em `Create Service Account`
3. Nomeie o serviço, por exemplo `pic-moments-drive-upload`
4. Crie a conta sem roles extras, use acesso por identidade da conta de serviço quando necessário.
5. Gere uma chave JSON e baixe ela.

### 3. Preparar a pasta no Drive

1. Crie uma pasta no Google Drive, por exemplo `Casamento Inara e Lucas`.
2. Compartilhe a pasta com o e-mail da service account.
3. Copie o ID da pasta da URL do Drive.

### 4. Emitir variável de ambiente

Exemplo:

```bash
export GOOGLE_DRIVE_FOLDER_ID="ID_DA_PASTA"
export GOOGLE_SERVICE_ACCOUNT_EMAIL="pic-moments-drive-upload@SEU_PROJECT.iam.gserviceaccount.com"
export GOOGLE_SERVICE_ACCOUNT_CREDENTIALS='{"type":"service_account", ...}'
```

alternativamente, salve credenciais em um arquivo JSON seguro e aponte `GOOGLE_APPLICATION_CREDENTIALS` para ele.

## Instalação

```bash
npm install
cp .env.example .env
```

Preencha os valores sensíveis em `.env`.

## Execução local

```bash
npm run dev
```

Ou em produção:

```bash
npm start
```

## Deploy

Exemplo com Render, Railway, Fly.io ou VPS Linux:

1. Configure `PORT`.
2. Configure `GOOGLE_DRIVE_FOLDER_ID`.
3. Configure `GOOGLE_SERVICE_ACCOUNT_CREDENTIALS` como secret.
4. Garanta HTTPS e domínio público.
5. Inicie a aplicação com `npm start`.

## Observações

- O Google Drive não aceita upload de arquivos sem nome, por isso o app usa o nome original do arquivo.
- O `private_key` da service account tem quebra de linha e deve ser mantido em uma string JSON válida.
- Para produção, use um secret manager e HTTPS.
