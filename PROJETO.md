# Agile Consultoria · Vagas: anotações do projeto

Documento para retomar o projeto no futuro. Explica como tudo funciona, onde fica cada peça,
como atualizar e o que ficou pendente.

> **Segurança:** este repositório é **público** (é assim que o GitHub Pages fica de graça).
> Por isso, aqui **não** há a chave de acesso, o link completo da cliente, e-mails nem senhas.
> A seção "Onde ficam os dados sensíveis" diz onde encontrar cada um.

---

## 1. O que é

O app de celular **Agile Consultoria** serve a uma cliente que divulga vagas do LinkedIn num grupo de WhatsApp.
O grupo cobre **Matão, Araraquara, São Carlos e Taquaritinga (SP)** e é de **todas as áreas, não só TI**.

O que o app faz:
- busca as vagas sozinho todo dia, por volta das **11:30 e das 17:00**;
- confere no LinkedIn se cada vaga ainda está aberta;
- monta a **imagem** (1080×1350) e a **mensagem no padrão do grupo**;
- a cliente revisa e envia **uma vaga por mensagem**, com um toque. O WhatsApp abre com a imagem e o texto prontos.

Custo: **zero**. Usa Google Apps Script, GitHub Pages, alertas do LinkedIn e a busca pública do LinkedIn.

## 2. Peças

| Peça | Onde | Observação |
|---|---|---|
| App (front-end) | `index.html` + `manifest.json` + ícones, neste repositório | Publicado pelo GitHub Pages em `https://leonardo-pania.github.io/agile-vagas/` |
| Servidor (API) | Projeto do Google Apps Script **"Agile Consultoria - Vagas"**, na conta Google do Leonardo (a mesma do LinkedIn) | Cópia do código em `servidor/` |
| ID do projeto Apps Script | `1Fu-FuuNIwq3xS9MM-VV4eb9Ql9VMGPdB5UZzC8t8KdMOCUa9XWlKUZhl` | Editor: `https://script.google.com/home/projects/<ID>/edit`. Só abre logado na conta dele |
| Implantação | App da Web, versão 3 (18/11/2026). Executar como: **Eu**. Quem pode acessar: **Qualquer pessoa** | Para atualizar, crie uma **nova versão na mesma implantação** (a URL não muda) |
| Alertas do LinkedIn | Conta LinkedIn do Leonardo | Lista na seção 5 |
| Gmail | Conta do Leonardo: marcador **"Vagas"** + filtro `from:jobalerts-noreply@linkedin.com` → Vagas (sem passar pela caixa de entrada) | Criado por `instalar()` |
| Buscas automáticas | Gatilhos de horário do Apps Script: `buscaAutomatica` às 11:30 e às 17:00 (America/Sao_Paulo) | Recriar com `agendarBuscasAutomaticas()` |

### Onde ficam os dados sensíveis (fora do repositório)
- **Chave da API:** Propriedades do script → `CHAVE`. Para ver, rode `instalar()` no editor: ele mostra `SUA CHAVE: ...` no log e não troca a chave se ela já existe.
- **URL do servidor (`/exec`):** no editor, em Implantar → Gerenciar implantações.
- **Link da cliente** (configura o app no primeiro acesso):
  `https://leonardo-pania.github.io/agile-vagas/#api=<URL /exec>&chave=<CHAVE>`
  Mande só no privado da cliente, **nunca no grupo**.

## 3. Como uma busca funciona (`buscar_` em `servidor/Code.gs`)

1. **E-mails de alerta:** lê `(label:Vagas OR from:jobalerts-noreply@linkedin.com) -in:trash`, com até 30 conversas por busca.
   - Alerta de outra cidade é ignorado: o cabeçalho "Seu alerta de vaga para X em: Cidade" é lido por `localDoAlerta_`.
   - Vaga cuja cidade, segundo o e-mail, está fora da região é descartada sem consulta.
   - Os e-mails lidos vão para a lixeira.
2. **Busca direta:** chama `jobs-guest/jobs/api/seeMoreJobPostings/search` para cada cidade.
   - Parâmetros: `distance=10`, `sortBy=DD`, `f_TPR=r86400` (na primeira vez, `r604800`).
   - Páginas por cidade: 1 na busca manual, 3 na automática.
   - Cidades vizinhas são ignoradas sem registro.
3. **Conferência:** cada vaga é aberta em `jobs-guest/jobs/api/jobPosting/<id>`.
   - Dali saem título, empresa, local, "publicada há", jornada, modalidade, logo e **benefícios**.
   - 404 = removida; `closed-job` = encerrada.
   - Limites por busca: 40 conferências na manual e 90 na automática, com prazo de cerca de 4,5 min.
4. **Classificação** (`classificar_`) descarta:
   - vaga removida ou encerrada;
   - vaga com mais de 15 dias (configurável);
   - vaga fora da região.
5. **O que o app vê** (`montarResposta_`):
   - vaga conferida, ou vaga do e-mail com cidade conhecida;
   - vaga da busca direta só aparece **depois de conferida**. Antes disso entra na contagem `aguardando`.
6. **Histórico:** chaves `v_<id>` guardam o que já foi enviado ou descartado por 45 dias. Fica curto para não estourar o limite de 500 KB das Propriedades.

**Armazenamento (Propriedades do script):**
- `p_<id>`: fila
- `v_<id>`: histórico
- `a_<empresa>`: nome curto que a cliente digitou
- `AJUSTES`
- `CHAVE`
- `AGENDA`
- `ultimaBusca`, `ultimaPesquisaDireta`, `ultimasDescartadas`, `linkedinLimitou`

**API (`doGet`, sempre com `chave`):** `acao` = `listar`, `buscar`, `enviada`, `descartar`, `ajustes` ou `salvarAjustes`.

## 4. Mensagem (padrão definido pelo Leonardo; mantenha)

```
📢 OPORTUNIDADE DE EMPREGO!

<Cargo>

📍 <Cidade>/SP
⏰ <Jornada>.
Empresa: <Empresa>

🎁 Benefícios: <lista>.

Interessados podem conferir os requisitos e realizar a candidatura diretamente pelo link:

🔗 <link>

Compartilhe com quem possa ter interesse! 🤝

AGILE | Vagas e Conexões
```

- As linhas sem informação somem: sem jornada não há ⏰, e sem benefícios não há 🎁.
- **Benefícios:** `extrairBeneficios_` resume os mais comuns a partir de uma lista fixa (`BENEFICIOS_`), na ordem dela.
  - Exemplo real (Aticca): "Vale-alimentação, auxílio combustível, PLR, assistência médica e odontológica, TotalPass, Day Off de aniversário e refeitório."
  - A cliente pode editar na revisão.
- Nas Configurações do app dá para editar a primeira linha, o texto antes do link, o final da mensagem e os textos da arte.

## 5. Alertas do LinkedIn (conta do Leonardo)

Todos com frequência diária e aviso por e-mail e notificação. O LinkedIn manda os e-mails por volta das **9:06**.

- `jobs` em Matão, Araraquara, São Carlos e Taquaritinga (raio pequeno)
- `auxiliar`, `vendedor`, `operador`, `aprendiz` e `administrativo` em Araraquara, com raio de 40 km (a lista do LinkedIn mostra "25", que é o valor em milhas).
  - Na interface nova, criar alerta pelo endereço é assim: `https://www.linkedin.com/jobs/search-results/?keywords=<palavra>&geoId=102499791&distance=24.85484`. O `geoId` 102499791 é Araraquara. Depois é só ligar a chave "Receber alertas de vaga para esta pesquisa".
- Antigos, que o app ignora porque são de outras cidades:
  - Assistente (São Paulo), Estagiário e Assistente (América Latina), Analista (Americana), Desenvolvedor de front-end (São Paulo)
  - Ficou **pendente** decidir se apagamos.
- O alerta antigo "Estágio em Matão" é da região e continua valendo.

## 6. Como atualizar

**Servidor**
1. Cole `servidor/Code.gs` no editor do Apps Script (arquivo `Código.gs`) e salve.
2. Se mudar `appsscript.json`, ligue "Mostrar arquivo de manifesto" ou edite o arquivo, que já aparece no editor.
3. Publique: Implantar → Gerenciar implantações → lápis (Editar) → Versão: **Nova versão** → Implantar. A URL continua a mesma.
4. Se entrar uma permissão nova (escopo), rode qualquer função no editor e **o Leonardo autoriza** em "Revisar permissões".
5. Para mudar os horários automáticos, altere `CONFIG.HORARIOS_AUTOMATICOS` e rode `agendarBuscasAutomaticas()`.
6. `zerarFilaEHistorico()` limpa a fila e o histórico. Use só se precisar recomeçar.

**App**
- Suba o `index.html` novo neste repositório. O GitHub Pages publica em cerca de 1 minuto.
- O app **não tem service worker**, então quem já instalou recebe a versão nova sozinho ao abrir.
- `manifest.json`: `theme_color` e `background_color` ficam **#000000**. No Android, a barra de navegação de baixo usa o `theme_color` gravado na instalação. Se mudar, é preciso reinstalar o app ou esperar o Chrome atualizar.

**Testes**
- Servidor: `node servidor/teste-servidor.js`. Simula Gmail, LinkedIn, Propriedades e gatilhos, e precisa terminar com "Tudo certo.".
- App: abra `index.html#demo` (modo demonstração, com dados de exemplo e sem servidor).

## 7. Riscos e limites conhecidos

- **LinkedIn limita consultas** (429/999). O código para, avisa no app (`linkedinLimitou`) e continua na busca seguinte.
  - Na primeira busca automática foram cerca de 43 conferências antes do limite.
  - Não afeta contas pessoais: o servidor acessa só páginas públicas, sem login.
- **O LinkedIn pode mudar o HTML** das páginas públicas. Classes usadas:
  - na vaga: `top-card-layout__title`, `topcard__org-name-link`, `topcard__flavor--bullet`, `posted-time-ago__text`, `show-more-less-html__markup`, `description__job-criteria-subheader`, `closed-job`;
  - na busca: `base-search-card__title`, `base-search-card__subtitle`, `job-search-card__location`, `job-search-card__listdate`, `data-entity-urn="urn:li:jobPosting:<id>"`.
  - Se a busca direta parar, o app continua pelos e-mails de alerta.
- **WhatsApp:** o envio é manual **de propósito**. Postar sozinho exigiria a API paga ou ferramentas não oficiais, com risco de bloqueio do número.
- **Cotas do Apps Script** (conta comum): gatilhos somam cerca de 90 min por dia, e cada busca automática leva de 3 a 5 min. Também há o limite de UrlFetch por dia e de 500 KB nas Propriedades.
- Horários automáticos variam cerca de ±15 min (`nearMinute`).

## 8. Preferências e decisões do Leonardo (importante)

- **Perguntar antes de decidir** e **mostrar uma prévia** (imagem ou GIF) antes de entregar mudanças visuais.
- Custo zero, sempre.
- Grupo **não é só de TI**: priorizar vagas de todas as áreas.
- Uma vaga por mensagem. Envio manual com tela de revisão. Celular Android.
- **Imagem da vaga:** a logo da empresa contratante é a principal, e a logo da **Agile Consultoria** (vinho e dourado) é secundária.
- **App:** nome "Agile Consultoria".
- **Abertura de 5 s:**
  - fundo todo preto;
  - de 0 a 2 s, a logo da **Pania Company** (leão) surge do preto;
  - de 2 a 5 s, o brilho passa da esquerda para a direita (a logo fica parada), com barra de carregamento e "BEM-VINDO".
  - Sem faixa vinho em cima ou embaixo.
- **Segurança:**
  - nunca guardar senhas em lugar nenhum;
  - quem faz login e autoriza OAuth é sempre o Leonardo;
  - o link com a chave vai só para a cliente.

## 9. Pendências e ideias

- [ ] Decidir se apagamos os alertas antigos do LinkedIn (seção 5).
- [ ] Remover a primeira instalação, que ficou na conta Google da cliente (projeto Apps Script + filtro e marcador "Vagas" no Gmail). Precisa do login dela.
- [ ] GitHub pediu verificação em duas etapas na conta Leonardo-Pania até 23/11/2026.
- [ ] Pequeno: título todo em minúscula vindo do LinkedIn (ex.: "mecânico industrial") poderia ganhar a primeira letra maiúscula em `arrumarTitulo_`.
- Ideias oferecidas e ainda não feitas:
  - adicionar vaga manualmente (colar link de LinkedIn, Gupy, Indeed…);
  - filtro por cidade;
  - imagem no formato do Status do WhatsApp;
  - hashtags de área e cidade;
  - histórico e relatório semanal;
  - bloquear empresa ou palavra.

## 10. Dicas para automatizar pelo navegador (para quem for mexer)

**Editor do Apps Script**
- Trocar o código: `monaco.editor.getModels()`, pegar o modelo com `function buscar_(` e usar `setValue`. Para salvar, clique em "Salvar projeto no Drive".
- Seletor de função `[role="listbox"][aria-label="Selecione a função para executar"]`:
  - abra com eventos mousedown, mouseup e click e escolha a opção visível;
  - às vezes precisa repetir;
  - confira `aria-selected` antes de clicar em "Executar a função selecionada".

**GitHub**
- Para enviar um arquivo sem arrastar: na página `/upload/main`, crie um `DataTransfer` com um `File` e atribua a `input[type=file].files`, disparando o evento `change`. Depois clique em "Commit changes".
- `raw.githubusercontent.com/.../main/...` pode vir em cache. Para ler a versão exata, use o SHA do commit.

**Imagens**
- As logos da Agile e da Pania ficam **dentro do `index.html`**, em base64 JPEG, na constante `LOGOS`. Dá para extrair de lá se precisar dos arquivos.
