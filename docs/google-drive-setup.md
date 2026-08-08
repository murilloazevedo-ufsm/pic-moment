# Guia para Google Drive + Service Account

## Passo a passo

### 1. Criar projeto no Google Cloud Console

1. Acesse https://console.cloud.google.com/
2. Crie um novo projeto ou selecione um já existente.
3. Ative a API do Google Drive:
   - APIs & Services > Library
   - procure "Google Drive API"
   - clique em Enable

### 2. Criar Service Account

1. Vá em IAM & Admin > Service Accounts
2. Clique em Create Service Account
3. Nomeie a conta: `pic-moments-drive-upload`
4. Em permissões, não é necessário adicionar papel de admin
5. Clique em Done
6. Na conta criada, abra a aba Keys
7. Clique em Add Key > Create new key > JSON
8. Baixe o JSON e salve em local seguro fora do repositório

### 3. Compartilhar a pasta do Drive

1. Crie uma pasta no Drive, por exemplo: `Casamento Inara e Lucas`
2. Abra a pasta e selecione Share
3. Adicione o endereço de e-mail da service account, por exemplo:

```text
pic-moments-drive-upload@<project-id>.iam.gserviceaccount.com
```

4. Configure o acesso como Editor
5. Copie o ID da pasta da URL do Drive:

```text
https://drive.google.com/drive/folders/ID_DA_PASTA
```

### 4. Configurar variáveis de ambiente

No servidor, configure as variáveis a seguir:

```bash
export GOOGLE_DRIVE_FOLDER_ID="ID_DA_PASTA"
export GOOGLE_SERVICE_ACCOUNT_EMAIL="pic-moments-drive-upload@<project-id>.iam.gserviceaccount.com"
export GOOGLE_SERVICE_ACCOUNT_CREDENTIALS='{"type":"service_account",...}'
```

Se preferir, o JSON pode ficar em um arquivo protegido e ser lido pelo processo. O mais importante é não versionar o JSON e não expor as credenciais no frontend.

### 5. Teste do upload

1. Inicie a aplicação com `npm start`
2. Faça upload de uma foto pela página web
3. Valide se o arquivo aparece na pasta do Drive compartilhada

## Observações de segurança

- Nunca deixar o JSON da service account em `/public`.
- Nunca colocar a credencial em HTML, JavaScript ou build do frontend.
- Usar HTTPS em produção.
- Configurar rate limiting e permitir apenas imagens com tamanho e número controlados.
