# agile-vagas

App de vagas da **Agile Consultoria**: busca vagas do LinkedIn em Matão, Araraquara, São Carlos e Taquaritinga (SP), confere se ainda estão abertas e prepara a imagem e a mensagem para o grupo de WhatsApp. A cliente revisa e envia uma vaga por vez.

- **App:** https://leonardo-pania.github.io/agile-vagas/ (modo demonstração: `#demo`)
- **Servidor:** Google Apps Script. O código está em [`servidor/`](servidor/)
- **Como tudo funciona, como atualizar e o que ficou pendente:** [`PROJETO.md`](PROJETO.md)

| Arquivo | O que é |
|---|---|
| `index.html` | O app inteiro (tela, arte, mensagem, filtros, abertura) |
| `manifest.json`, `icone-*.png` | Instalação no celular |
| `servidor/Code.gs` | API e buscas (cópia do que está no Apps Script) |
| `servidor/appsscript.json` | Manifesto do Apps Script (permissões e serviço do Gmail) |
| `servidor/teste-servidor.js` | Testes do servidor: `node servidor/teste-servidor.js` |

A chave de acesso e o link de configuração da cliente **não** ficam neste repositório, porque ele é público. O `PROJETO.md` explica onde encontrá-los.

Desenvolvido por Pania Company.
