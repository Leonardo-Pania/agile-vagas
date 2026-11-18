/**
 * VAGAS DO GRUPO: servidor (Google Apps Script)
 * ------------------------------------------------------------
 * Lê os alertas de vaga do LinkedIn que caem na pasta (marcador) "Vagas"
 * do Gmail, confere cada vaga na página pública do LinkedIn e entrega a
 * lista pronta para o app do celular (index.html).
 *
 * Instalação (resumo):
 *   1. Cole este arquivo num projeto em script.google.com e o appsscript.json
 *      no manifesto (Configurações do projeto > "Mostrar appsscript.json").
 *   2. Rode a função `instalar` uma vez e autorize. Ela cria o marcador e o
 *      filtro do Gmail e mostra a CHAVE no log.
 *   3. Implantar > Nova implantação > App da Web
 *        Executar como: Eu  |  Quem pode acessar: Qualquer pessoa
 *   4. Use o URL do app da Web + a CHAVE no app do celular.
 */

// ===================== AJUSTES =====================
const CONFIG = {
  ROTULO_GMAIL: 'Vagas',                 // marcador do Gmail onde os alertas caem
  CIDADES: ['Matão', 'Araraquara', 'São Carlos', 'Taquaritinga'],
  UF: 'SP',
  MAX_DIAS: 15,                          // vaga publicada há mais que isso é descartada
  APAGAR_EMAILS: true,                   // manda os e-mails lidos para a lixeira
  MAX_CONVERSAS_POR_BUSCA: 30,
  MAX_VERIFICACOES_POR_BUSCA: 40,        // o LinkedIn limita acessos seguidos
  PAUSA_ENTRE_VERIFICACOES_MS: 1200,
  REVERIFICAR_APOS_HORAS: 12,
  GUARDAR_HISTORICO_DIAS: 45,            // por quanto tempo lembrar vagas já enviadas/descartadas
  // Busca direta na pesquisa pública de vagas do LinkedIn (além dos e-mails de alerta)
  BUSCA_DIRETA: true,
  RAIO_BUSCA: 10,                        // raio em volta de cada cidade (unidade do LinkedIn, ~16 km)
  PAGINAS_BUSCA_MANUAL: 1,               // páginas de 10 vagas por cidade quando ela toca em "Buscar"
  PAGINAS_BUSCA_AUTOMATICA: 3,           // ... nas buscas automáticas
  MAX_VERIFICACOES_AUTOMATICA: 90,
  PAUSA_ENTRE_PESQUISAS_MS: 2000,
  TEMPO_MAXIMO_MS: 270000,               // para antes do limite de 6 minutos do Google
  // Buscas automáticas (horário de Brasília). Depois de mudar, rode agendarBuscasAutomaticas()
  HORARIOS_AUTOMATICOS: [[11, 30], [17, 0]],
};
// ===================================================

const DIA_MS = 24 * 60 * 60 * 1000;
const REMETENTE_ALERTAS = 'jobalerts-noreply@linkedin.com';
const URL_VAGA_PUBLICA = 'https://www.linkedin.com/jobs-guest/jobs/api/jobPosting/';
const URL_BUSCA_PUBLICA = 'https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search';
const FUSO = 'America/Sao_Paulo';
const CABECALHOS = { 'Accept-Language': 'pt-BR,pt;q=0.9' };

// ---------------------------------------------------------------------------
// Ajustes que a cliente muda pela tela de Configurações do app
// ---------------------------------------------------------------------------
let ajustesCache_ = null;

function ajustes_() {
  if (ajustesCache_) return ajustesCache_;
  let salvos = {};
  try { salvos = JSON.parse(PropertiesService.getScriptProperties().getProperty('AJUSTES') || '{}'); } catch (e) { salvos = {}; }
  ajustesCache_ = {
    cidades: Array.isArray(salvos.cidades) && salvos.cidades.length ? salvos.cidades : CONFIG.CIDADES.slice(),
    maxDias: Number(salvos.maxDias) || CONFIG.MAX_DIAS,
    msgCabecalho: salvos.msgCabecalho || '',
    msgChamada: salvos.msgChamada || '',
    msgRodape: salvos.msgRodape || '',
    arteSelo: salvos.arteSelo || '',
    arteChamada: salvos.arteChamada || '',
  };
  return ajustesCache_;
}

function cidades_() { return ajustes_().cidades; }
function maxDias_() { return ajustes_().maxDias; }

function salvarAjustes_(json) {
  let d;
  try { d = JSON.parse(json || '{}'); } catch (e) { throw new Error('Configurações em formato inválido'); }
  const texto = function (v, max) { return String(v == null ? '' : v).replace(/\s+$/, '').slice(0, max); };
  const cidades = (Array.isArray(d.cidades) ? d.cidades : [])
    .map(function (c) { return String(c || '').replace(/\s+/g, ' ').trim().slice(0, 60); })
    .filter(function (c, i, todas) { return c.length >= 2 && todas.indexOf(c) === i; })
    .slice(0, 20);
  if (!cidades.length) throw new Error('Informe pelo menos uma cidade');
  const maxDias = Math.round(Number(d.maxDias));
  if (!(maxDias >= 1 && maxDias <= 60)) throw new Error('O limite de dias precisa ficar entre 1 e 60');
  const novo = {
    cidades: cidades,
    maxDias: maxDias,
    msgCabecalho: texto(d.msgCabecalho, 80),
    msgChamada: texto(d.msgChamada, 240),
    msgRodape: texto(d.msgRodape, 300),
    arteSelo: texto(d.arteSelo, 24),
    arteChamada: texto(d.arteChamada, 40),
  };
  PropertiesService.getScriptProperties().setProperty('AJUSTES', JSON.stringify(novo));
  ajustesCache_ = null;
  return ajustes_();
}

// ---------------------------------------------------------------------------
// Entrada do app da Web (API JSON)
// ---------------------------------------------------------------------------
function doGet(e) {
  const p = (e && e.parameter) || {};
  try {
    if (!p.acao) {
      return json_({ ok: true, app: 'vagas-do-grupo', msg: 'API funcionando. Abra o app pelo link do celular.' });
    }
    if (!chaveValida_(p.chave)) {
      return json_({ ok: false, erro: 'Chave inválida. Confira o link de configuração do app.' });
    }
    switch (p.acao) {
      case 'listar':
        return json_(montarResposta_({}));
      case 'buscar':
        return json_(buscar_({ automatica: false }));
      case 'enviada':
        marcar_(p.id, 'enviada', p);
        return json_({ ok: true });
      case 'descartar':
        marcar_(p.id, 'descartada', p);
        return json_({ ok: true });
      case 'ajustes':
        return json_({ ok: true, ajustes: ajustes_() });
      case 'salvarAjustes':
        return json_({ ok: true, ajustes: salvarAjustes_(p.dados) });
      default:
        return json_({ ok: false, erro: 'Ação desconhecida: ' + p.acao });
    }
  } catch (err) {
    console.error(err && err.stack ? err.stack : err);
    return json_({ ok: false, erro: String((err && err.message) || err) });
  }
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function chaveValida_(chave) {
  const certa = PropertiesService.getScriptProperties().getProperty('CHAVE');
  return !!certa && chave === certa;
}

// ---------------------------------------------------------------------------
// Instalação e diagnóstico: rode pelo editor do Apps Script
// ---------------------------------------------------------------------------
function instalar() {
  const props = PropertiesService.getScriptProperties();
  let chave = props.getProperty('CHAVE');
  if (!chave) {
    chave = Utilities.getUuid().replace(/-/g, '').slice(0, 16);
    props.setProperty('CHAVE', chave);
  }

  const gmail = configurarGmail_();
  const conversas = GmailApp.search(consultaGmail_(), 0, 50).length;
  let agenda;
  try { agenda = agendarBuscasAutomaticas(); } catch (err) { agenda = 'não agendadas (' + err + ')'; }

  // Testa se o LinkedIn responde para os servidores do Google
  let testeLinkedIn = 'não testado';
  try {
    const busca = UrlFetchApp.fetch(
      'https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search?location=' +
        encodeURIComponent(cidades_()[0] + ', ' + CONFIG.UF),
      { muteHttpExceptions: true, headers: CABECALHOS });
    const ids = extrairIds_(busca.getContentText());
    if (busca.getResponseCode() !== 200 || !ids.length) {
      testeLinkedIn = 'LinkedIn respondeu código ' + busca.getResponseCode() +
        ' (as vagas podem aparecer como "não conferidas")';
    } else {
      Utilities.sleep(1500);
      const r = verificarUma_(ids[0]);
      testeLinkedIn = r.status === 'ok'
        ? 'OK. Exemplo: "' + r.titulo + '" | ' + r.empresa + ' | ' + r.localBruto + ' | ' + (r.jornada || '-')
        : 'Resposta inesperada (' + r.status + (r.falha ? ': ' + r.falha : '') + ')';
    }
  } catch (err) {
    testeLinkedIn = 'Erro: ' + err;
  }

  console.log([
    '==============================================',
    'INSTALAÇÃO CONCLUÍDA',
    'Marcador do Gmail: "' + CONFIG.ROTULO_GMAIL + '" (' + conversas + ' conversa(s) com alertas agora)',
    'Filtro do Gmail: ' + gmail.filtro + (gmail.arquivados ? ' | ' + gmail.arquivados + ' alerta(s) tirados da caixa de entrada' : ''),
    'Teste do LinkedIn: ' + testeLinkedIn,
    'Buscas automáticas: ' + agenda,
    '',
    'SUA CHAVE: ' + chave,
    '',
    'Próximo passo: Implantar > Nova implantação > App da Web',
    '  Executar como: Eu | Quem pode acessar: Qualquer pessoa',
    '==============================================',
  ].join('\n'));
}

/**
 * Cria o marcador "Vagas" e um filtro que manda os alertas do LinkedIn direto para ele,
 * sem passar pela caixa de entrada. Precisa do serviço avançado "Gmail" (já vem no appsscript.json).
 */
function configurarGmail_() {
  const rotulo = GmailApp.getUserLabelByName(CONFIG.ROTULO_GMAIL) || GmailApp.createLabel(CONFIG.ROTULO_GMAIL);
  let filtro = 'serviço Gmail não está ativo (o app funciona, mas os alertas ficam na caixa de entrada até a busca)';
  if (typeof Gmail !== 'undefined') {
    const respMarcadores = Gmail.Users.Labels.list('me');
    const marcadores = (respMarcadores && respMarcadores.labels) || [];
    const marcador = marcadores.filter(function (l) { return l.name === CONFIG.ROTULO_GMAIL; })[0];
    const respFiltros = Gmail.Users.Settings.Filters.list('me'); // vem vazio quando a conta não tem filtros
    const filtros = (respFiltros && respFiltros.filter) || [];
    const jaExiste = filtros.some(function (f) {
      return f.criteria && f.criteria.from === REMETENTE_ALERTAS &&
        f.action && (f.action.addLabelIds || []).indexOf(marcador.id) !== -1;
    });
    if (jaExiste) {
      filtro = 'já existia';
    } else {
      Gmail.Users.Settings.Filters.create({
        criteria: { from: REMETENTE_ALERTAS },
        action: { addLabelIds: [marcador.id], removeLabelIds: ['INBOX'] },
      }, 'me');
      filtro = 'criado (alertas do LinkedIn vão direto para "' + CONFIG.ROTULO_GMAIL + '")';
    }
  }
  // alertas que já estavam na caixa de entrada
  const naCaixa = GmailApp.search('from:' + REMETENTE_ALERTAS + ' in:inbox', 0, 100);
  naCaixa.forEach(function (t) { t.addLabel(rotulo); t.moveToArchive(); });
  return { filtro: filtro, arquivados: naCaixa.length };
}

/** Zera o histórico e a fila (não mexe na chave nem nos apelidos de empresa). */
function zerarFilaEHistorico() {
  const props = PropertiesService.getScriptProperties();
  const todas = props.getProperties();
  Object.keys(todas).forEach(function (k) {
    if (/^(p_|v_)/.test(k) || k === 'ultimasDescartadas') props.deleteProperty(k);
  });
  console.log('Fila e histórico apagados.');
}

// ---------------------------------------------------------------------------
// Busca principal
// ---------------------------------------------------------------------------
function buscar_(opcoes) {
  opcoes = opcoes || {};
  const inicio = Date.now();
  const prazo = inicio + CONFIG.TEMPO_MAXIMO_MS;
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) {
    return { ok: false, erro: 'Já tem uma busca em andamento. Tente de novo em 1 minuto.' };
  }
  try {
    const props = PropertiesService.getScriptProperties();
    let todas = props.getProperties();
    limparHistorico_(todas, props);
    todas = props.getProperties();

    // 1) Lê os e-mails e guarda as vagas novas na fila (antes de apagar os e-mails)
    const lidos = lerEmails_(todas);
    // 1b) Pesquisa direto no LinkedIn as vagas das cidades (não depende do e-mail)
    const direta = CONFIG.BUSCA_DIRETA
      ? pesquisarLinkedIn_(todas, lidos.vagas,
        opcoes.automatica ? CONFIG.PAGINAS_BUSCA_AUTOMATICA : CONFIG.PAGINAS_BUSCA_MANUAL, prazo)
      : { vagas: {}, novas: 0, limitado: false };
    Object.keys(direta.vagas).forEach(function (id) { lidos.vagas[id] = direta.vagas[id]; });
    const agoraLeitura = Date.now();
    const descartesEmail = {};
    lidos.foraDaRegiao.forEach(function (d) { descartesEmail['v_' + d.id] = 'd|' + agoraLeitura; });
    if (Object.keys(descartesEmail).length) props.setProperties(descartesEmail);
    const novasProps = {};
    Object.keys(lidos.vagas).forEach(function (id) {
      novasProps['p_' + id] = JSON.stringify(lidos.vagas[id]);
    });
    if (Object.keys(novasProps).length) props.setProperties(novasProps);
    if (CONFIG.APAGAR_EMAILS) lidos.conversas.forEach(function (t) { t.moveToTrash(); });
    if (CONFIG.BUSCA_DIRETA && !direta.limitado) props.setProperty('ultimaPesquisaDireta', String(inicio));

    // 2) Decide quem precisa ser conferido no LinkedIn
    todas = props.getProperties();
    const fila = lerFila_(todas);
    const agora = Date.now();
    const conferir = fila.filter(function (v) {
      return v.status !== 'ok' || !v.verificadaEm ||
        agora - v.verificadaEm > CONFIG.REVERIFICAR_APOS_HORAS * 3600 * 1000;
    }).slice(0, opcoes.automatica ? CONFIG.MAX_VERIFICACOES_AUTOMATICA : CONFIG.MAX_VERIFICACOES_POR_BUSCA);

    const verif = verificarVarias_(conferir.map(function (v) { return v.id; }), prazo);

    // 3) Junta as informações, classifica e salva
    const descartadas = lidos.foraDaRegiao.slice();
    const salvar = {};
    fila.forEach(function (v) {
      const r = verif.resultados[v.id];
      if (r) aplicarVerificacao_(v, r);
      const c = classificar_(v);
      if (c.descartar) {
        props.deleteProperty('p_' + v.id);
        salvar['v_' + v.id] = 'd|' + agora;
        descartadas.push({ id: v.id, titulo: v.titulo || '(sem título)', empresa: v.empresa || '',
          local: v.local || '', motivo: c.motivo, link: v.link });
      } else {
        v.aviso = c.aviso || '';
        salvar['p_' + v.id] = JSON.stringify(v);
      }
    });
    salvar.ultimaBusca = String(agora);
    salvar.ultimasDescartadas = JSON.stringify(cabeEm_(descartadas, 8000));
    salvar.linkedinLimitou = (verif.limitado || direta.limitado) ? '1' : '';
    props.setProperties(salvar);

    return montarResposta_({
      descartadas: descartadas,
      emailsLidos: lidos.emails,
      vagasNovas: Object.keys(lidos.vagas).length + lidos.foraDaRegiao.length,
      pelaPesquisa: direta.novas,
      alertasIgnorados: lidos.alertasIgnorados,
    });
  } finally {
    lock.releaseLock();
  }
}

function consultaGmail_() {
  // pelo marcador ou pelo remetente (se algum alerta escapou do filtro)
  return '(label:' + CONFIG.ROTULO_GMAIL.trim().replace(/\s+/g, '-') + ' OR from:' + REMETENTE_ALERTAS + ') -in:trash';
}

function lerEmails_(todas) {
  const conversas = GmailApp.search(consultaGmail_(), 0, CONFIG.MAX_CONVERSAS_POR_BUSCA);
  const limite = Date.now() - maxDias_() * DIA_MS;
  const vagas = {};
  const foraDaRegiao = [];
  const vistas = {};
  let emails = 0;
  let alertasIgnorados = 0;
  conversas.forEach(function (t) {
    t.getMessages().forEach(function (m) {
      emails++;
      const data = m.getDate().getTime();
      if (data < limite) return; // alerta velho: só apaga
      const html = m.getBody() || '';
      const texto = m.getPlainBody() || '';
      // "Seu alerta de vaga para X em: São Paulo": alerta de outra cidade não interessa ao grupo
      const localAlerta = localDoAlerta_(texto);
      if (localAlerta && !analisarLocal_(localAlerta).atendida) { alertasIgnorados++; return; }
      const idsTexto = extrairIds_(texto);
      const ids = idsTexto.length ? idsTexto : extrairIds_(html);
      ids.forEach(function (id) {
        if (vistas[id] || todas['p_' + id] || todas['v_' + id]) return;
        vistas[id] = true;
        const info = infoDoEmail_(texto, id);
        const doHtml = infoDoHtml_(html, id);
        const titulo = arrumarTitulo_(doHtml.titulo || info.titulo || '');
        const loc = analisarLocal_(info.local);
        // o próprio e-mail já diz que a vaga é de outra cidade: descarta sem gastar consulta ao LinkedIn
        if (loc.texto && !loc.atendida && loc.pareceLocal) {
          foraDaRegiao.push({ id: id, titulo: titulo || '(sem título)', empresa: arrumarEmpresa_(info.empresa || ''),
            local: loc.texto, motivo: 'Fora da região (' + loc.texto + ')',
            link: 'https://www.linkedin.com/jobs/view/' + id + '/' });
          return;
        }
        vagas[id] = {
          id: id,
          titulo: titulo,
          empresaOriginal: arrumarEmpresa_(info.empresa || ''),
          localBruto: info.local || '',
          logoUrl: doHtml.logoUrl || '',
          link: 'https://www.linkedin.com/jobs/view/' + id + '/',
          status: 'nova',
          origem: 'email',
          dataEmail: data,
        };
      });
    });
  });
  return { vagas: vagas, foraDaRegiao: foraDaRegiao, conversas: conversas, emails: emails, alertasIgnorados: alertasIgnorados };
}

/** "Seu alerta de vaga para X em: Matão, São Paulo, Brasil foi criado" → "Matão, São Paulo, Brasil" */
function localDoAlerta_(texto) {
  const m = String(texto || '').match(/alerta de vagas? para [^\n]*?\bem:\s*([^\n]+?)(?:\s+foi criado.*)?\s*$/im);
  return m ? m[1].trim() : '';
}

/** IDs de vaga em links do LinkedIn (/jobs/view/123..., /comm/jobs/view/..., currentJobId=...). */
function extrairIds_(s) {
  const ids = [];
  const vistos = {};
  const res = [
    /jobs\/view\/(?:[^\/?"'\s<>]*?-)?(\d{8,12})(?=[\/?"'\s<>&#]|$)/g,
    /currentJobId=(\d{8,12})/g,
    /urn:li:jobPosting:(\d{8,12})/g,
  ];
  res.forEach(function (re) {
    let m;
    while ((m = re.exec(s)) !== null) {
      if (!vistos[m[1]]) { vistos[m[1]] = true; ids.push(m[1]); }
    }
  });
  return ids;
}

/**
 * Plano B, quando a página do LinkedIn não responde: tenta tirar título,
 * empresa e local das linhas do e-mail logo acima do link da vaga.
 */
function infoDoEmail_(texto, id) {
  const linhas = String(texto).split(/\r?\n/).map(function (l) { return l.trim(); });
  let idx = -1;
  for (let i = 0; i < linhas.length; i++) {
    if (linhas[i].indexOf(id) !== -1 && /jobs\/view|currentJobId/.test(linhas[i])) { idx = i; break; }
  }
  if (idx === -1) return {};
  const ruido = /candidatura simplificada|easy apply|candidate-se|curr[ií]culo|recrutando|actively recruiting|ex-alunos|alumni|ex-funcion|trabalha aqui|conex(ã|a)o|conex(õ|o)es|connection|promovida|promoted|^r\$|sal[aá]rio|visualizar vaga|ver vaga|view job|primeiras pessoas|vaga verificada|^h[aá] \d+|alerta de vaga|^https?:/i;
  const achadas = [];
  for (let i = idx - 1; i >= 0 && idx - i <= 8 && achadas.length < 3; i--) {
    const l = linhas[i];
    if (!l || /^[-=_*]{3,}$/.test(l)) {
      if (achadas.length) break;
      continue;
    }
    if (/jobs\/view|currentJobId/.test(l)) break; // chegou na vaga anterior
    if (ruido.test(l)) continue;
    achadas.unshift(l);
  }
  // Se a própria linha do link tem texto antes da URL, usa como título
  const antes = linhas[idx].split(/https?:\/\//)[0].replace(/[:\-–|]+\s*$/, '').trim();
  if (!achadas.length && antes && !ruido.test(antes)) achadas.push(antes);
  // "Empresa · Cidade, SP" numa linha só vira duas partes
  const partes = [];
  achadas.forEach(function (l) {
    l.split(/\s+[·•]\s+/).forEach(function (p) { if (p.trim()) partes.push(p.trim()); });
  });
  return { titulo: partes[0] || '', empresa: partes[1] || '', local: partes[2] || '' };
}

/** Do HTML do e-mail: título (texto do link da vaga) e logo da empresa mais próxima antes do link. */
function infoDoHtml_(html, id) {
  html = String(html || '');
  let titulo = '';
  const reLink = new RegExp('<a[^>]+jobs/view/(?:[^"\'>]*-)?' + id + '[^>]*>([\\s\\S]*?)</a>', 'g');
  let m;
  while ((m = reLink.exec(html)) !== null && !titulo) {
    const t = textoLimpo_(m[1]);
    if (/[A-Za-zÀ-ÿ]{3,}/.test(t) && !/^(ver|view|candidat|apply)/i.test(t)) titulo = t;
  }
  let logoUrl = '';
  const pos = html.search(new RegExp('jobs/view/(?:[^"\'>]*-)?' + id));
  if (pos > 0) {
    let trecho = html.slice(Math.max(0, pos - 4000), pos);
    // não pega a logo da vaga anterior: corta no último link de outra vaga
    const reOutra = /jobs\/view\/(?:[^"'>]*-)?(\d{8,12})/g;
    let corte = 0;
    let o;
    while ((o = reOutra.exec(trecho)) !== null) { if (o[1] !== id) corte = o.index; }
    trecho = trecho.slice(corte);
    const imgs = trecho.match(/https:\/\/media\.licdn\.com\/dms\/image\/[^"'\s)]+company-logo[^"'\s)]*/g);
    if (imgs) logoUrl = decodificar_(imgs[imgs.length - 1]);
  }
  return { titulo: titulo, logoUrl: logoUrl };
}

// ---------------------------------------------------------------------------
// Pesquisa direta na busca pública de vagas do LinkedIn
// ---------------------------------------------------------------------------
function pesquisarLinkedIn_(todas, jaAchadas, paginas, prazo) {
  const vagas = {};
  let consultas = 0;
  let limitado = false;
  let foraDaRegiao = 0;
  // Na primeira vez pega a última semana; depois, as últimas 24 h
  const periodo = todas.ultimaPesquisaDireta ? 'r86400' : 'r604800';
  const estado = CONFIG.UF === 'SP' ? 'São Paulo' : CONFIG.UF;
  const agora = Date.now();
  const cidades = cidades_();
  for (let c = 0; c < cidades.length && !limitado; c++) {
    for (let pg = 0; pg < paginas; pg++) {
      if (Date.now() > prazo - 60000) { c = cidades.length; break; } // guarda tempo para conferir
      if (consultas > 0) Utilities.sleep(CONFIG.PAUSA_ENTRE_PESQUISAS_MS);
      const url = URL_BUSCA_PUBLICA + '?keywords=&location=' + encodeURIComponent(cidades[c] + ', ' + estado + ', Brasil') +
        '&distance=' + CONFIG.RAIO_BUSCA + '&f_TPR=' + periodo + '&sortBy=DD&start=' + (pg * 10);
      let r = baixarPagina_(url);
      consultas++;
      if (r.codigo === 429 || r.codigo === 999) {
        Utilities.sleep(6000);
        r = baixarPagina_(url);
        consultas++;
        if (r.codigo === 429 || r.codigo === 999) { limitado = true; break; }
      }
      if (r.codigo !== 200) break;
      const cartoes = lerCartoesBusca_(r.html);
      cartoes.forEach(function (k) {
        if (vagas[k.id] || jaAchadas[k.id] || todas['p_' + k.id] || todas['v_' + k.id]) return;
        const loc = analisarLocal_(k.local);
        if (!loc.atendida) { foraDaRegiao++; return; } // cidade vizinha: nem guarda
        vagas[k.id] = {
          id: k.id,
          titulo: arrumarTitulo_(k.titulo),
          empresaOriginal: arrumarEmpresa_(k.empresa),
          localBruto: k.local,
          logoUrl: k.logoUrl,
          link: 'https://www.linkedin.com/jobs/view/' + k.id + '/',
          status: 'nova',
          origem: 'busca',
          dataEmail: agora,
          publicadaEm: k.data,
        };
      });
      if (cartoes.length < 10) break; // acabou a lista dessa cidade
    }
  }
  return { vagas: vagas, novas: Object.keys(vagas).length, consultas: consultas, limitado: limitado, foraDaRegiao: foraDaRegiao };
}

function baixarPagina_(url) {
  try {
    const resp = UrlFetchApp.fetch(url, { muteHttpExceptions: true, followRedirects: true, headers: CABECALHOS });
    const codigo = resp.getResponseCode();
    return { codigo: codigo, html: codigo === 200 ? resp.getContentText() : '' };
  } catch (err) {
    return { codigo: 0, html: '' };
  }
}

/** Cada <li> da pesquisa pública é um cartão de vaga. */
function lerCartoesBusca_(html) {
  return String(html || '').split(/<li[\s>]/).slice(1).map(function (li) {
    const id = pegar_(li, /jobPosting:(\d{6,12})/);
    if (!id) return null;
    const logo = decodificar_(pegar_(li, /<img[^>]*data-delayed-url="([^"]+)"/));
    return {
      id: id,
      titulo: textoLimpo_(pegar_(li, /base-search-card__title[^>]*>([\s\S]*?)<\/h3>/)),
      empresa: textoLimpo_(pegar_(li, /base-search-card__subtitle[^>]*>([\s\S]*?)<\/h4>/)),
      local: textoLimpo_(pegar_(li, /job-search-card__location[^>]*>([\s\S]*?)<\/span>/)),
      data: pegar_(li, /<time[^>]*datetime="([^"]+)"/),
      logoUrl: /^https:\/\/media\.licdn\.com\//.test(logo) ? logo : '',
    };
  }).filter(Boolean);
}

// ---------------------------------------------------------------------------
// Benefícios: resume os mais comuns no texto da vaga, no jeito que a cliente escreve
// (ex.: "Vale-alimentação, auxílio combustível, PLR, assistência médica e odontológica, TotalPass")
// ---------------------------------------------------------------------------
const BENEFICIOS_ = [
  ['vale-alimentação', /vale[\s-]*alimenta|cart[aã]o[\s-]*alimenta|\bva\b(?=\s*[;,.:)(-]|\s+(e|de|no|r\$))/],
  ['vale-refeição', /vale[\s-]*refei|cart[aã]o[\s-]*refei|\bvr\b(?=\s*[;,.:)(-]|\s+(e|de|no|r\$))/],
  ['cesta básica', /cesta[\s-]*b[aá]sica/],
  ['vale-transporte', /vale[\s-]*transporte|\bvt\b(?=\s*[;,.:)(-]|\s+(e|de|no|r\$))/],
  ['transporte fretado', /fretado/],
  ['auxílio combustível', /(aux[ií]lio|ajuda|vale|reembolso)[\s-]*(de\s+)?combust[ií]vel/],
  ['PLR', /\bplr\b|\bppr\b|participa[cç][aã]o nos (lucros|resultados)/],
  ['assistência médica', /assist[eê]ncia m[eé]dica|plano de sa[uú]de|plano m[eé]dico|conv[eê]nio m[eé]dico|seguro[\s-]sa[uú]de|plano[^.;]{0,25}unimed/],
  ['assistência odontológica', /(plano|assist[eê]ncia|conv[eê]nio|seguro)[^.;]{0,30}odonto|uniodonto|m[eé]dic[oa] e odonto/],
  ['seguro de vida', /seguro de vida/],
  ['TotalPass', /total\s*pass/],
  ['Wellhub (Gympass)', /gympass|wellhub/],
  ['Day Off', /day[\s-]*off|folga (no|de) anivers/],
  ['refeitório', /refeit[oó]rio|refei[cç][aã]o no local/],
  ['auxílio-creche', /aux[ií]lio[\s-]*creche/],
  ['previdência privada', /previd[eê]ncia privada/],
  ['convênio farmácia', /conv[eê]nio[^.;]{0,15}farm[aá]cia|desconto[^.;]{0,15}farm[aá]cia/],
  ['auxílio educação', /aux[ií]lio[\s-]*(educa|estudo)|bolsas? de estudo|universidade corporativa/],
  ['cesta de Natal', /cesta (natalina|de natal)/],
];

function extrairBeneficios_(descricao) {
  const t = String(descricao || '').toLowerCase();
  if (!t) return '';
  const achados = [];
  BENEFICIOS_.forEach(function (b) {
    if (!b[1].test(t)) return;
    let nome = b[0];
    if (nome === 'Day Off' && /(day[\s-]*off|folga)[^.;]{0,30}anivers/.test(t)) nome = 'Day Off de aniversário';
    achados.push(nome);
  });
  const med = achados.indexOf('assistência médica');
  const odo = achados.indexOf('assistência odontológica');
  if (med !== -1 && odo !== -1) {
    achados[med] = 'assistência médica e odontológica';
    achados.splice(odo, 1);
  }
  if (!achados.length) return '';
  const lista = achados.length === 1 ? achados[0]
    : achados.slice(0, -1).join(', ') + ' e ' + achados[achados.length - 1];
  return lista.charAt(0).toUpperCase() + lista.slice(1);
}

// ---------------------------------------------------------------------------
// Buscas automáticas (gatilhos de horário do Apps Script)
// ---------------------------------------------------------------------------
function buscaAutomatica() {
  const r = buscar_({ automatica: true });
  console.log(r.ok
    ? 'Busca automática: ' + (r.vagasNovas || 0) + ' nova(s) (' + (r.pelaPesquisa || 0) + ' pela pesquisa), ' +
      r.pendentes.length + ' pronta(s), ' + (r.aguardando || 0) + ' esperando conferência, ' +
      (r.descartadas || []).length + ' descartada(s)' + (r.linkedinLimitou ? ' | LinkedIn limitou' : '')
    : 'Busca automática não rodou: ' + r.erro);
}

/** Rode pelo editor para (re)criar os horários. Apaga os antigos para não duplicar. */
function agendarBuscasAutomaticas() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'buscaAutomatica') ScriptApp.deleteTrigger(t);
  });
  const textos = [];
  CONFIG.HORARIOS_AUTOMATICOS.forEach(function (h) {
    ScriptApp.newTrigger('buscaAutomatica').timeBased().everyDays(1)
      .atHour(h[0]).nearMinute(h[1]).inTimezone(FUSO).create();
    textos.push(h[0] + ':' + ('0' + h[1]).slice(-2));
  });
  const agenda = textos.length > 1 ? textos.slice(0, -1).join(', ') + ' e ' + textos[textos.length - 1] : textos.join('');
  PropertiesService.getScriptProperties().setProperty('AGENDA', agenda);
  console.log('Buscas automáticas agendadas: todo dia por volta de ' + agenda + ' (horário de Brasília)');
  return 'todo dia por volta de ' + agenda;
}

// ---------------------------------------------------------------------------
// Conferência na página pública do LinkedIn
// ---------------------------------------------------------------------------
function verificarVarias_(ids, prazo) {
  const resultados = {};
  let limitado = false;
  for (let i = 0; i < ids.length; i++) {
    const id = ids[i];
    if (prazo && Date.now() > prazo) {
      resultados[id] = { status: 'nao_verificada', falha: 'fica para a próxima busca' };
      continue;
    }
    if (limitado) {
      resultados[id] = { status: 'nao_verificada', falha: 'LinkedIn limitou os acessos; tenta de novo na próxima busca' };
      continue;
    }
    if (i > 0) Utilities.sleep(CONFIG.PAUSA_ENTRE_VERIFICACOES_MS);
    let r = verificarUma_(id);
    if (r.codigo === 429 || r.codigo === 999) {
      Utilities.sleep(6000);
      r = verificarUma_(id);
      if (r.codigo === 429 || r.codigo === 999) limitado = true;
    }
    resultados[id] = r;
  }
  return { resultados: resultados, limitado: limitado };
}

function verificarUma_(id) {
  try {
    const resp = UrlFetchApp.fetch(URL_VAGA_PUBLICA + id, {
      muteHttpExceptions: true, followRedirects: true, headers: CABECALHOS,
    });
    const codigo = resp.getResponseCode();
    const r = interpretarPagina_(codigo, codigo === 200 ? resp.getContentText() : '');
    r.codigo = codigo;
    return r;
  } catch (err) {
    return { status: 'nao_verificada', falha: 'erro de conexão', codigo: 0 };
  }
}

function interpretarPagina_(codigo, html) {
  if (codigo === 404 || codigo === 410) return { status: 'removida' };
  if (codigo !== 200) return { status: 'nao_verificada', falha: 'LinkedIn respondeu código ' + codigo };

  const titulo = textoLimpo_(pegar_(html, /<h2[^>]*top-card-layout__title[^>]*>([\s\S]*?)<\/h2>/));
  if (!titulo) return { status: 'nao_verificada', falha: 'página da vaga em formato inesperado' };

  const empresa = textoLimpo_(
    pegar_(html, /<a[^>]*topcard__org-name-link[^>]*>([\s\S]*?)<\/a>/) ||
    pegar_(html, /<span[^>]*class="topcard__flavor"[^>]*>([\s\S]*?)<\/span>/));
  const localBruto = textoLimpo_(pegar_(html, /<span[^>]*topcard__flavor--bullet[^>]*>([\s\S]*?)<\/span>/));
  const publicada = textoLimpo_(pegar_(html, /<span[^>]*posted-time-ago__text[^>]*>([\s\S]*?)<\/span>/));
  const descricao = textoLimpo_(pegar_(html, /<div[^>]*show-more-less-html__markup[^>]*>([\s\S]*?)<\/div>/));
  const logo = decodificar_(pegar_(html, /<img[^>]*artdeco-entity-image[^>]*data-delayed-url="([^"]+)"/));

  const criterios = {};
  const reCrit = /description__job-criteria-subheader[^>]*>([\s\S]*?)<\/h3>\s*<span[^>]*>([\s\S]*?)<\/span>/g;
  let m;
  while ((m = reCrit.exec(html)) !== null) {
    criterios[semAcento_(textoLimpo_(m[1]).toLowerCase())] = textoLimpo_(m[2]);
  }

  return {
    status: /class="closed-job|closed-job__flavor--closed/.test(html) ? 'encerrada' : 'ok',
    titulo: titulo,
    empresa: empresa,
    localBruto: localBruto,
    publicada: publicada,
    dias: diasDesde_(publicada),
    jornada: criterios['tipo de emprego'] || criterios['employment type'] || '',
    modalidade: detectarModalidade_(titulo, descricao),
    beneficios: extrairBeneficios_(descricao),
    logoUrl: /^https:\/\/media\.licdn\.com\//.test(logo) ? logo : '',
  };
}

function aplicarVerificacao_(v, r) {
  // Se já estava conferida e agora o LinkedIn só não respondeu, mantém como conferida
  if (r.status === 'nao_verificada' && v.status === 'ok') return;
  v.status = r.status;
  v.falha = r.falha || '';
  if (r.status === 'ok' || r.status === 'encerrada') {
    v.origem = 'linkedin';
    v.verificadaEm = Date.now();
    v.titulo = arrumarTitulo_(r.titulo) || v.titulo;
    v.empresaOriginal = arrumarEmpresa_(r.empresa) || v.empresaOriginal;
    v.localBruto = r.localBruto || v.localBruto;
    v.publicada = r.publicada || '';
    v.dias = r.dias;
    v.jornada = r.jornada || v.jornada || '';
    v.modalidade = r.modalidade || v.modalidade || '';
    v.beneficios = r.beneficios || v.beneficios || '';
    v.logoUrl = r.logoUrl || v.logoUrl || '';
  }
}

/** Decide se a vaga vai para a revisão ou é descartada (e por quê). */
function classificar_(v) {
  if (v.status === 'removida') return { descartar: true, motivo: 'Vaga removida do LinkedIn' };
  if (v.status === 'encerrada') return { descartar: true, motivo: 'Não aceita mais candidaturas' };
  if (typeof v.dias === 'number' && v.dias > maxDias_()) {
    return { descartar: true, motivo: 'Publicada há ' + v.dias + ' dias' };
  }
  if (v.dataEmail && Date.now() - v.dataEmail > maxDias_() * DIA_MS) {
    return { descartar: true, motivo: 'Ficou mais de ' + maxDias_() + ' dias na fila' };
  }

  const loc = analisarLocal_(v.localBruto);
  // Pela página do LinkedIn o local é confiável; pelo e-mail, só se parecer um local
  if (loc.texto) {
    if (loc.atendida) {
      v.local = loc.texto;
      if (!v.modalidade && loc.modalidade) v.modalidade = loc.modalidade;
    } else if (v.origem === 'linkedin' || loc.pareceLocal) {
      return { descartar: true, motivo: 'Fora da região (' + loc.texto + ')' };
    }
  }

  const avisos = [];
  if (v.status !== 'ok') avisos.push('Não deu para conferir no LinkedIn agora. Abra o link antes de enviar.');
  if (!v.local) avisos.push('Cidade não identificada.');
  return { descartar: false, aviso: avisos.join(' ') };
}

// ---------------------------------------------------------------------------
// Resposta para o app
// ---------------------------------------------------------------------------
function montarResposta_(extra) {
  const props = PropertiesService.getScriptProperties();
  const todas = props.getProperties();
  const apelidos = {};
  Object.keys(todas).forEach(function (k) { if (k.indexOf('a_') === 0) apelidos[k.slice(2)] = todas[k]; });

  // Vaga não conferida e sem cidade conhecida fica esperando a próxima busca (não aparece para a cliente)
  const todasDaFila = lerFila_(todas);
  // Vaga achada na pesquisa direta só aparece depois de conferida (aí já tem jornada e benefícios)
  const fila = todasDaFila.filter(function (v) { return v.status === 'ok' || (!!v.local && v.origem !== 'busca'); });
  const aguardando = todasDaFila.length - fila.length;
  const logos = logosEmBase64_(fila);
  const pendentes = fila.map(function (v) {
    const original = v.empresaOriginal || '';
    return {
      id: v.id,
      titulo: v.titulo || '',
      empresa: apelidos[chaveEmpresa_(original)] || original,
      empresaOriginal: original,
      local: v.local || '',
      modalidade: v.modalidade || '',
      jornada: v.jornada || '',
      beneficios: v.beneficios || '',
      publicada: v.publicada || '',
      link: v.link,
      conferida: v.status === 'ok',
      aviso: v.aviso || '',
      logo: logos[v.id] || '',
    };
  });

  let descartadas = extra.descartadas;
  if (!descartadas) {
    try { descartadas = JSON.parse(todas.ultimasDescartadas || '[]'); } catch (e) { descartadas = []; }
  }
  return {
    ok: true,
    pendentes: pendentes,
    descartadas: descartadas,
    ultimaBusca: Number(todas.ultimaBusca || 0),
    linkedinLimitou: todas.linkedinLimitou === '1',
    emailsLidos: extra.emailsLidos,
    vagasNovas: extra.vagasNovas,
    alertasIgnorados: extra.alertasIgnorados,
    pelaPesquisa: extra.pelaPesquisa,
    aguardando: aguardando,
    agenda: todas.AGENDA || '',
    ajustes: ajustes_(),
  };
}

function lerFila_(todas) {
  const fila = [];
  Object.keys(todas).forEach(function (k) {
    if (k.indexOf('p_') !== 0) return;
    try { fila.push(JSON.parse(todas[k])); } catch (e) { /* ignora registro corrompido */ }
  });
  fila.sort(function (a, b) {
    return ((a.dataEmail || 0) - (b.dataEmail || 0)) || String(a.publicadaEm || '').localeCompare(String(b.publicadaEm || ''));
  });
  return fila;
}

/** Baixa as logos das empresas (com cache de 6 h) para a arte não depender do LinkedIn no celular. */
function logosEmBase64_(fila) {
  const cache = CacheService.getScriptCache();
  const comLogo = fila.filter(function (v) { return v.logoUrl; });
  if (!comLogo.length) return {};
  const chaves = comLogo.map(function (v) { return 'logo_' + v.id; });
  const emCache = cache.getAll(chaves) || {};
  const saida = {};
  const faltam = [];
  comLogo.forEach(function (v) {
    const c = emCache['logo_' + v.id];
    if (c) saida[v.id] = c; else faltam.push(v);
  });
  if (faltam.length) {
    let resps = [];
    try {
      resps = UrlFetchApp.fetchAll(faltam.map(function (v) { return { url: v.logoUrl, muteHttpExceptions: true }; }));
    } catch (e) { resps = []; }
    const novos = {};
    resps.forEach(function (r, i) {
      if (r.getResponseCode() !== 200) return;
      const blob = r.getBlob();
      const bytes = blob.getBytes();
      if (!bytes.length || bytes.length > 60000) return;
      const tipo = blob.getContentType() || 'image/png';
      if (!/^image\//.test(tipo)) return;
      const url = 'data:' + tipo + ';base64,' + Utilities.base64Encode(bytes);
      saida[faltam[i].id] = url;
      novos['logo_' + faltam[i].id] = url;
    });
    if (Object.keys(novos).length) cache.putAll(novos, 21600);
  }
  return saida;
}

function marcar_(id, tipo, p) {
  if (!/^\d{6,12}$/.test(String(id || ''))) throw new Error('ID de vaga inválido');
  const props = PropertiesService.getScriptProperties();
  props.deleteProperty('p_' + id);
  props.setProperty('v_' + id, (tipo === 'enviada' ? 'e' : 'd') + '|' + Date.now());
  // Lembra o nome curto da empresa que ela digitou (ex.: "Oxi-Maq")
  if (tipo === 'enviada' && p.empresaOriginal && p.empresa) {
    const original = String(p.empresaOriginal).slice(0, 120);
    const novo = String(p.empresa).trim().slice(0, 80);
    const chave = chaveEmpresa_(original);
    if (chave && novo && novo !== original) props.setProperty('a_' + chave, novo);
  }
}

function limparHistorico_(todas, props) {
  const limite = Date.now() - CONFIG.GUARDAR_HISTORICO_DIAS * DIA_MS;
  Object.keys(todas).forEach(function (k) {
    if (k.indexOf('v_') !== 0) return;
    const t = Number(String(todas[k]).split('|')[1] || 0);
    if (t && t < limite) props.deleteProperty(k);
  });
}

// ---------------------------------------------------------------------------
// Textos
// ---------------------------------------------------------------------------
function pegar_(s, re) {
  const m = String(s || '').match(re);
  return m ? m[1] : '';
}

function decodificar_(s) {
  return String(s || '')
    .replace(/&#x([0-9a-f]+);/gi, function (_, h) { return String.fromCharCode(parseInt(h, 16)); })
    .replace(/&#(\d+);/g, function (_, d) { return String.fromCharCode(Number(d)); })
    .replace(/&nbsp;/g, ' ').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
}

function textoLimpo_(s) {
  return decodificar_(String(s || '')
    .replace(/<br\s*\/?>/gi, ' ').replace(/<\/(p|li|div|h\d)>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ').replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ').trim();
}

const MAPA_ACENTOS_ = { á: 'a', à: 'a', â: 'a', ã: 'a', ä: 'a', é: 'e', è: 'e', ê: 'e', ë: 'e', í: 'i', ì: 'i',
  î: 'i', ï: 'i', ó: 'o', ò: 'o', ô: 'o', õ: 'o', ö: 'o', ú: 'u', ù: 'u', û: 'u', ü: 'u', ç: 'c', ñ: 'n',
  Á: 'A', À: 'A', Â: 'A', Ã: 'A', Ä: 'A', É: 'E', È: 'E', Ê: 'E', Ë: 'E', Í: 'I', Ì: 'I', Î: 'I', Ï: 'I',
  Ó: 'O', Ò: 'O', Ô: 'O', Õ: 'O', Ö: 'O', Ú: 'U', Ù: 'U', Û: 'U', Ü: 'U', Ç: 'C', Ñ: 'N' };

/** Tira acentos sem mudar o tamanho do texto (os índices continuam valendo). */
function semAcento_(s) {
  return String(s || '').replace(/[^\u0000-\u007f]/g, function (c) { return MAPA_ACENTOS_[c] || c; });
}

function diasDesde_(txt) {
  const t = semAcento_(String(txt || '').toLowerCase());
  if (!t) return null;
  const m = t.match(/(\d+)\s*\+?\s*(minuto|min|hora|hour|hr|dia|day|semana|week|mes|month|ano|year)/);
  if (!m) return /agora|now|hoje|today/.test(t) ? 0 : null;
  const n = Number(m[1]);
  const u = m[2];
  if (/^(minuto|min|hora|hour|hr)/.test(u)) return 0;
  if (/^(dia|day)/.test(u)) return n;
  if (/^(semana|week)/.test(u)) return n * 7;
  if (/^(mes|month)/.test(u)) return n * 30;
  return n * 365;
}

function detectarModalidade_(titulo, descricao) {
  const t = semAcento_(String(titulo || '').toLowerCase());
  const d = semAcento_(String(descricao || '').toLowerCase());
  const tipo = function (s) {
    if (/hibrid/.test(s)) return 'híbrida';
    if (/remot|home ?office|teletrabalho/.test(s)) return 'remota';
    if (/presencial/.test(s)) return 'presencial';
    return '';
  };
  const noTitulo = tipo(t);
  if (noTitulo) return noTitulo;
  const explicita = d.match(/(modelo|regime|modalidade|formato|local)\s*(de\s+)?(trabalho|atuacao)?\s*[:\-–]?\s*(100%\s*)?(presencial|hibrid[oa]|remot[oa]|home ?office)/);
  if (explicita) return tipo(explicita[0]);
  if (/\bhibrid[oa]\b/.test(d)) return 'híbrida';
  if (/100% remot|trabalho remoto|vaga remota|\bhome office\b/.test(d)) return 'remota';
  if (/\bpresencial\b/.test(d)) return 'presencial';
  return '';
}

function regexCidadeNoFim_() {
  const cidades = cidades_().map(function (c) {
    return semAcento_(c.toLowerCase()).replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
  }).join('|');
  return new RegExp('\\s*[-|–—:,/]\\s*(' + cidades + ')(\\s*[-/,]\\s*(sp|sao paulo))?\\s*$');
}

const SIGLAS_ = ['TI', 'RH', 'SP', 'PCD', 'PJ', 'CLT', 'CNH', 'SAC', 'QA', 'UX', 'UI', 'BI', 'DP', 'SDR', 'BDR',
  'ERP', 'SAP', 'CAD', 'EAD', 'CEO', 'CFO', 'CTO', 'PCP', 'SESMT', 'LGPD', 'NR', 'B2B', 'B2C', 'TV', 'II', 'III', 'IV',
  'SST', 'EHS', 'HSE', 'CNC', 'CRM', 'KAM', 'MKT', 'PMO', 'FP&A'];
const MINUSCULAS_ = ['de', 'da', 'do', 'das', 'dos', 'e', 'em', 'na', 'no', 'nas', 'nos', 'para', 'com', 'a', 'o', 'ou', 'por'];

function arrumarTitulo_(t) {
  t = String(t || '').replace(/\s+/g, ' ').trim();
  if (!t) return '';
  t = t.replace(/\s*\(\s*\d{4,}\s*\)\s*$/, '');       // códigos internos, ex.: (584875)
  const re = regexCidadeNoFim_();
  for (let i = 0; i < 2; i++) {
    const m = semAcento_(t.toLowerCase()).match(re);
    if (m && m.index > 3) t = t.slice(0, m.index).trim();
  }
  const letras = t.replace(/[^A-Za-zÀ-ÿ]/g, '');
  const maiusculas = t.replace(/[^A-ZÀ-Þ]/g, '');
  if (letras.length >= 6 && maiusculas.length / letras.length > 0.85) t = capitalizar_(t);
  return t.trim();
}

function capitalizar_(t) {
  return t.toLowerCase().split(' ').map(function (palavra, i) {
    const nua = palavra.replace(/[^A-Za-zÀ-ÿ0-9&]/g, '').toUpperCase();
    if (SIGLAS_.indexOf(nua) !== -1) return palavra.toUpperCase();
    if (i > 0 && MINUSCULAS_.indexOf(palavra) !== -1) return palavra;
    // maiúscula no início e depois de hífen ou barra: administrativo-financeiro → Administrativo-Financeiro
    return palavra.replace(/(^|[-\/])([a-zà-ÿ])/g, function (_, sep, c) { return sep + c.toUpperCase(); });
  }).join(' ');
}

function arrumarEmpresa_(e) {
  e = String(e || '').replace(/\s+/g, ' ').trim();
  for (let i = 0; i < 2; i++) {
    e = e.replace(/[\s,.\-]+(ltda\.?|ltd\.?|s\/a|s\.a\.?|eireli|epp|me|inc\.?)$/i, '').trim();
  }
  return e;
}

function chaveEmpresa_(nome) {
  return semAcento_(String(nome || '').toLowerCase()).replace(/[^a-z0-9]+/g, ' ').trim().slice(0, 60);
}

/** "Araraquara, SP" ou "Araraquara, São Paulo, Brasil" → { texto: "Araraquara/SP", atendida: true } */
function analisarLocal_(bruto) {
  let s = String(bruto || '').replace(/\s+/g, ' ').trim();
  if (!s) return { texto: '', atendida: false, pareceLocal: false };
  let modalidade = '';
  const par = s.match(/\(([^)]*)\)\s*$/);
  if (par) {
    const dentro = semAcento_(par[1].toLowerCase());
    if (/hibrid/.test(dentro)) modalidade = 'híbrida';
    else if (/remot/.test(dentro)) modalidade = 'remota';
    else if (/presencial|on-?site/.test(dentro)) modalidade = 'presencial';
    s = s.slice(0, par.index).trim();
  }
  const partes = s.split(/\s*[,/]\s*|\s+-\s+/).filter(Boolean);
  const norm = semAcento_(s.toLowerCase());
  const cidade = cidades_().filter(function (c) {
    return norm.indexOf(semAcento_(c.toLowerCase())) !== -1;
  })[0] || '';
  let uf = '';
  partes.slice(1).forEach(function (p) {
    const pn = semAcento_(p.toLowerCase());
    if (!uf && /^[a-z]{2}$/.test(pn)) uf = p.toUpperCase();
    if (!uf && pn === 'sao paulo') uf = 'SP';
  });
  const ufOk = !uf || uf === CONFIG.UF;
  const atendida = !!cidade && ufOk;
  const texto = atendida ? cidade + '/' + CONFIG.UF : (partes.length > 1 ? partes[0] + '/' + (uf || partes[1]) : s);
  const pareceLocal = partes.length > 1 || /brasil|brazil|remot|hibrid|presencial/.test(norm);
  return { texto: texto, atendida: atendida, pareceLocal: pareceLocal, modalidade: modalidade };
}

/** Corta a lista até caber no limite de tamanho de uma propriedade. */
function cabeEm_(lista, limite) {
  const copia = lista.slice(0, 40);
  while (copia.length && JSON.stringify(copia).length > limite) copia.pop();
  return copia;
}
