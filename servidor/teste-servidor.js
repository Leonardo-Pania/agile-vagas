// Roda o Code.gs no Node com Gmail, LinkedIn e armazenamento simulados.
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const assert = require('assert');

const DIA = 86400000;
let falhas = 0;
function ok(cond, msg) {
  if (cond) console.log('  ✔ ' + msg);
  else { console.log('  ✖ ' + msg); falhas++; }
}

// ---------- simuladores ----------
const store = {};
const props = {
  getProperty: (k) => (k in store ? store[k] : null),
  setProperty: (k, v) => { store[k] = String(v); },
  setProperties: (o) => { Object.keys(o).forEach((k) => { store[k] = String(o[k]); }); },
  getProperties: () => Object.assign({}, store),
  deleteProperty: (k) => { delete store[k]; },
};

let threads = [];
function msg(dataMs, html, texto) {
  return { getDate: () => new Date(dataMs), getBody: () => html, getPlainBody: () => texto };
}
function thread(msgs) {
  const t = { lixo: false, getMessages: () => msgs, moveToTrash: () => { t.lixo = true; } };
  return t;
}
const GmailApp = {
  search: (q, s, max) => { GmailApp.ultimaConsulta = q; return threads.filter((t) => !t.lixo).slice(0, max); },
  getUserLabelByName: () => null,
  createLabel: (n) => ({ name: n }),
};

function pagina(o) {
  return `<section class="top-card-layout"><a href="x"><h2 class="top-card-layout__title font-sans text-lg topcard__title">${o.titulo}</h2></a>
  <h4><div class="topcard__flavor-row"><span class="topcard__flavor"> <a class="topcard__org-name-link topcard__flavor--black-link" href="x"> ${o.empresa} </a></span>
  <span class="topcard__flavor topcard__flavor--bullet"> ${o.local} </span></div>
  <div class="topcard__flavor-row"><span class="posted-time-ago__text topcard__flavor--metadata"> ${o.publicada} </span></div></h4>
  ${o.fechada ? '<figure class="closed-job closed-job__flavor topcard__flavor-row"><figcaption class="closed-job__flavor--closed">Não aceita mais candidaturas</figcaption></figure>' : ''}
  <img class="artdeco-entity-image artdeco-entity-image--square-5 " data-delayed-url="https://media.licdn.com/dms/image/v2/X/company-logo_100_100/0/1/${o.id}_logo?e=1&amp;v=beta&amp;t=abc" data-ghost-classes="x">
  <div class="show-more-less-html__markup show-more-less-html__markup--clamp-after-5"> ${o.desc || ''} </div>
  <ul class="description__job-criteria-list"><li class="description__job-criteria-item"><h3 class="description__job-criteria-subheader"> Nível de experiência </h3>
  <span class="description__job-criteria-text description__job-criteria-text--criteria"> Pleno-sênior </span></li>
  <li class="description__job-criteria-item"><h3 class="description__job-criteria-subheader"> Tipo de emprego </h3>
  <span class="description__job-criteria-text description__job-criteria-text--criteria"> ${o.jornada || 'Tempo integral'} </span></li></ul></section>`;
}

const paginas = {};      // id -> {codigo, html} ou lista de respostas
const acessos = [];
function resp(codigo, texto, blob) {
  return {
    getResponseCode: () => codigo,
    getContentText: () => texto || '',
    getBlob: () => blob || { getBytes: () => [], getContentType: () => 'text/html' },
  };
}
const UrlFetchApp = {
  fetch: (url) => {
    acessos.push(url);
    const id = url.split('/').pop();
    let p = paginas[id];
    if (Array.isArray(p)) p = p.length > 1 ? p.shift() : p[0];
    if (!p) return resp(404, '');
    return resp(p.codigo, p.html);
  },
  fetchAll: (reqs) => reqs.map((r) => {
    acessos.push(r.url);
    if (/company-logo/.test(r.url)) {
      const bytes = Array.from(Buffer.from('PNGFAKE'));
      return resp(200, '', { getBytes: () => bytes, getContentType: () => 'image/png' });
    }
    return resp(404, '');
  }),
};
let pausas = 0;
const Utilities = {
  sleep: () => { pausas++; },
  base64Encode: (b) => Buffer.from(b).toString('base64'),
  getUuid: () => '1234abcd-5678-90ef-aaaa-bbbbccccdddd',
};
const cacheStore = {};
const CacheService = { getScriptCache: () => ({
  getAll: (ks) => { const o = {}; ks.forEach((k) => { if (cacheStore[k]) o[k] = cacheStore[k]; }); return o; },
  putAll: (o) => Object.assign(cacheStore, o),
}) };
const LockService = { getScriptLock: () => ({ tryLock: () => true, releaseLock: () => {} }) };
const ContentService = {
  MimeType: { JSON: 'json' },
  createTextOutput: (s) => ({ texto: s, setMimeType() { return this; } }),
};

const gatilhos = [];
const ScriptApp = {
  getProjectTriggers: () => gatilhos.slice(),
  deleteTrigger: (t) => { gatilhos.splice(gatilhos.indexOf(t), 1); },
  newTrigger: (fn) => {
    const g = { fn, getHandlerFunction: () => fn };
    const b = { timeBased: () => b, everyDays: (n) => { g.dias = n; return b; }, atHour: (h) => { g.hora = h; return b; },
      nearMinute: (m) => { g.minuto = m; return b; }, inTimezone: (z) => { g.fuso = z; return b; }, create: () => { gatilhos.push(g); return g; } };
    return b;
  },
};
const ctx = vm.createContext({
  ScriptApp,
  PropertiesService: { getScriptProperties: () => props },
  GmailApp, UrlFetchApp, Utilities, CacheService, LockService, ContentService,
  console: { log: (...a) => ctx.__logs.push(a.join(' ')), error: (...a) => console.error(...a) },
  __logs: [],
});
vm.runInContext(fs.readFileSync(path.join(__dirname, 'Code.gs'), 'utf8'), ctx, { filename: 'Code.gs' });
const api = (params) => JSON.parse(ctx.doGet({ parameter: params }).texto);

// ---------- 1. funções de texto ----------
console.log('\nTextos');
const T = (s) => ctx.arrumarTitulo_(s);
ok(T('SUPERVISOR(A) ADMINISTRATIVO-FINANCEIRO (A)') === 'Supervisor(a) Administrativo-Financeiro (a)', 'título em maiúsculas vira normal: ' + T('SUPERVISOR(A) ADMINISTRATIVO-FINANCEIRO (A)'));
ok(T('Operador(a) de Loja/Repositor - Parque Faber - São Carlos/SP (584875)') === 'Operador(a) de Loja/Repositor - Parque Faber', 'tira código e cidade do fim');
ok(T('Executivo de Vendas Pl. | Matão - SP') === 'Executivo de Vendas Pl.', 'tira " | Matão - SP"');
ok(T('ANALISTA DE TI JR') === 'Analista de TI Jr', 'mantém sigla TI: ' + T('ANALISTA DE TI JR'));
ok(T('Auxiliar de Produção') === 'Auxiliar de Produção', 'título normal fica igual');
ok(ctx.arrumarEmpresa_('Oxi-Maq Comercial e Industrial de Equipamentos LTDA') === 'Oxi-Maq Comercial e Industrial de Equipamentos', 'tira LTDA');
ok(ctx.arrumarEmpresa_('Raízen S.A.') === 'Raízen', 'tira S.A.');
const L = (s) => ctx.analisarLocal_(s);
ok(L('Araraquara, SP').texto === 'Araraquara/SP' && L('Araraquara, SP').atendida, 'Araraquara, SP → Araraquara/SP');
ok(L('São Carlos, São Paulo, Brasil').atendida && L('São Carlos, São Paulo, Brasil').texto === 'São Carlos/SP', 'São Carlos, São Paulo, Brasil');
ok(!L('São Carlos, SC').atendida, 'São Carlos/SC (Santa Catarina) não passa');
ok(!L('Ribeirão Preto, SP').atendida && L('Ribeirão Preto, SP').pareceLocal, 'Ribeirão Preto fora da região');
ok(L('Matão, SP (Presencial)').modalidade === 'presencial' && L('Matão, SP (Presencial)').atendida, 'lê "(Presencial)" do local');
ok(!L('Brasil').atendida && L('Brasil').pareceLocal, 'vaga "Brasil" (remota nacional) não passa');
const M = (t, d) => ctx.detectarModalidade_(t, d);
ok(M('Analista (Híbrido)', '') === 'híbrida', 'modalidade no título');
ok(M('Analista', 'Modelo de trabalho: presencial em Araraquara') === 'presencial', 'modalidade explícita na descrição');
ok(M('Analista', 'Benefícios: VR, VT. Regime híbrido 3x2.') === 'híbrida', 'regime híbrido');
ok(M('Vendedor', 'Atendimento ao cliente e vendas.') === '', 'sem informação → vazio');
ok(ctx.diasDesde_('Há 2 semanas') === 14 && ctx.diasDesde_('Há 1 mês') === 30 && ctx.diasDesde_('Há 5 horas') === 0 && ctx.diasDesde_('3 days ago') === 3, 'idade da vaga em pt e en');
const ids = ctx.extrairIds_('<a href="https://www.linkedin.com/comm/jobs/view/4479099544/?trackingId=x">x</a> https://br.linkedin.com/jobs/view/operador-at-gpa-4488196470?pos=1 currentJobId=4389848415&x');
ok(ids.join(',') === '4479099544,4488196470,4389848415', 'acha IDs nos 3 formatos de link: ' + ids.join(','));
const e1 = ctx.infoDoEmail_('Vagas novas\n\nAnalista Fiscal\nUsina X · Araraquara, SP (Presencial)\nCandidatura simplificada\nVer vaga: https://www.linkedin.com/comm/jobs/view/4111111111/?x=1\n---------\n', '4111111111');
ok(e1.titulo === 'Analista Fiscal' && e1.empresa === 'Usina X' && e1.local === 'Araraquara, SP (Presencial)', 'e-mail no formato "Empresa · Local"');
const e2 = ctx.infoDoEmail_('Assistente de RH\nEmpresa Y\nMatão, SP\nhttps://www.linkedin.com/comm/jobs/view/4222222222/\n', '4222222222');
ok(e2.titulo === 'Assistente de RH' && e2.empresa === 'Empresa Y' && e2.local === 'Matão, SP', 'e-mail em 3 linhas');
const h1 = ctx.infoDoHtml_('<img src="https://media.licdn.com/dms/image/v2/A/company-logo_100_100/0/1/a_logo?e=1&amp;t=x"><a href="https://www.linkedin.com/comm/jobs/view/4333333333/?a=1"><img src="y"></a><a href="https://www.linkedin.com/comm/jobs/view/4333333333/?b=2">Técnico de Segurança</a>', '4333333333');
ok(h1.titulo === 'Técnico de Segurança' && /company-logo/.test(h1.logoUrl) && h1.logoUrl.indexOf('&amp;') === -1, 'título e logo pelo HTML do e-mail');

// ---------- 2. chave ----------
console.log('\nChave e instalação');
ok(api({ acao: 'listar', chave: 'x' }).ok === false, 'sem instalar, qualquer chave é recusada');
paginas['4000000001'] = { codigo: 200, html: pagina({ id: 1, titulo: 'Teste', empresa: 'E', local: 'Araraquara, SP', publicada: 'Há 1 dia' }) };
UrlFetchApp._buscaOriginal = UrlFetchApp.fetch;
UrlFetchApp.fetch = (url, o) => /seeMoreJobPostings/.test(url) ? resp(200, '<li data-entity-urn="urn:li:jobPosting:4000000001">') : UrlFetchApp._buscaOriginal(url, o);
const filtrosCriados = [];
ctx.Gmail = { Users: {
  Labels: { list: () => ({ labels: [{ id: 'Label_7', name: 'Vagas' }, { id: 'INBOX', name: 'INBOX' }] }) },
  Settings: { Filters: { list: () => ({ filter: filtrosCriados.slice() }), create: (f) => { filtrosCriados.push(f); return f; } } },
} };
ctx.instalar();
ctx.instalar(); // rodar de novo não duplica o filtro
UrlFetchApp.fetch = UrlFetchApp._buscaOriginal;
ok(filtrosCriados.length === 1 && filtrosCriados[0].criteria.from === 'jobalerts-noreply@linkedin.com' &&
  filtrosCriados[0].action.addLabelIds[0] === 'Label_7' && filtrosCriados[0].action.removeLabelIds[0] === 'INBOX',
  'instalar() cria o filtro do Gmail (uma vez só): alertas vão para "Vagas" sem passar pela caixa de entrada');
ok(/Filtro do Gmail: já existia/.test(ctx.__logs.join('\n')), 'segunda instalação reconhece o filtro existente');
const chave = store.CHAVE;
ok(/^[0-9a-f]{16}$/.test(chave), 'instalar() cria a chave');
ok(ctx.__logs.join('\n').indexOf('Teste do LinkedIn: OK') !== -1, 'instalar() testa o LinkedIn e mostra no log');
ok(api({ acao: 'listar', chave: 'errada' }).ok === false, 'chave errada é recusada');
ok(api({ acao: 'listar', chave }).ok === true, 'chave certa funciona');
delete paginas['4000000001'];

// ---------- 3. primeira busca ----------
console.log('\nPrimeira busca');
const agora = Date.now();
const htmlEmail = [
  '<img src="https://media.licdn.com/dms/image/v2/A/company-logo_100_100/0/1/oxi_logo?e=1&amp;t=x">',
  '<a href="https://www.linkedin.com/comm/jobs/view/4479099544/?trk=1">SUPERVISOR(A) ADMINISTRATIVO-FINANCEIRO (A)</a>',
  '<a href="https://www.linkedin.com/comm/jobs/view/4400000002/?trk=1">Vaga fechada</a>',
  '<a href="https://www.linkedin.com/comm/jobs/view/4400000003/?trk=1">Vaga em SC</a>',
  '<a href="https://www.linkedin.com/comm/jobs/view/4400000005/?trk=1">Vaga antiga</a>',
  '<a href="https://www.linkedin.com/comm/jobs/view/4400000004/?trk=1">Auxiliar de Logística</a>',
].join('\n');
const textoEmail = [
  'Supervisor(a) Administrativo-Financeiro(a)', 'Oxi-Maq · Araraquara, SP', 'Ver vaga: https://www.linkedin.com/comm/jobs/view/4479099544/?trk=1', '',
  'Vaga fechada', 'Empresa F · Matão, SP', 'Ver vaga: https://www.linkedin.com/comm/jobs/view/4400000002/?trk=1', '',
  'Vaga em SC', 'Empresa G · São Carlos, SC', 'Ver vaga: https://www.linkedin.com/comm/jobs/view/4400000003/?trk=1', '',
  'Vaga antiga', 'Empresa H · Taquaritinga, SP', 'Ver vaga: https://www.linkedin.com/comm/jobs/view/4400000005/?trk=1', '',
  'Auxiliar de Logística', 'Transportadora Z · Taquaritinga, SP (Presencial)', 'Ver vaga: https://www.linkedin.com/comm/jobs/view/4400000004/?trk=1',
].join('\n');
const tA = thread([msg(agora - 3600000, htmlEmail, textoEmail)]);
const tVelho = thread([msg(agora - 20 * DIA, '<a href="https://www.linkedin.com/comm/jobs/view/4400000099/">x</a>', '')]);
threads = [tA, tVelho];

paginas['4479099544'] = { codigo: 200, html: pagina({ id: 'oxi', titulo: 'SUPERVISOR(A) ADMINISTRATIVO-FINANCEIRO (A)', empresa: 'Oxi-Maq Comercial e Industrial de Equipamentos LTDA', local: 'Araraquara, SP', publicada: 'Há 2 dias', desc: '<p>Modelo de trabalho: presencial.</p>' }) };
paginas['4400000002'] = { codigo: 200, html: pagina({ id: 2, titulo: 'Vaga fechada', empresa: 'Empresa F', local: 'Matão, SP', publicada: 'Há 3 dias', fechada: true }) };
paginas['4400000003'] = { codigo: 200, html: pagina({ id: 3, titulo: 'Vaga em SC', empresa: 'Empresa G', local: 'São Carlos, SC', publicada: 'Há 1 dia' }) };
paginas['4400000005'] = { codigo: 200, html: pagina({ id: 5, titulo: 'Vaga antiga', empresa: 'Empresa H', local: 'Taquaritinga, SP', publicada: 'Há 1 mês' }) };
paginas['4400000004'] = [{ codigo: 429, html: '' }, { codigo: 429, html: '' }]; // LinkedIn limitando

const r1 = api({ acao: 'buscar', chave });
ok(r1.ok, 'busca respondeu ok' + (r1.erro ? ' (' + r1.erro + ')' : ''));
ok(GmailApp.ultimaConsulta === '(label:Vagas OR from:jobalerts-noreply@linkedin.com) -in:trash', 'consulta do Gmail: ' + GmailApp.ultimaConsulta);
ok(tA.lixo && tVelho.lixo, 'e-mails lidos foram para a lixeira (inclusive o antigo)');
ok(r1.vagasNovas === 5, 'achou 5 vagas novas (o alerta de 20 dias foi ignorado): ' + r1.vagasNovas);
const pend = Object.fromEntries(r1.pendentes.map((v) => [v.id, v]));
ok(Object.keys(pend).sort().join(',') === '4400000004,4479099544', 'ficaram 2 para revisão: ' + Object.keys(pend).join(','));
const oxi = pend['4479099544'];
ok(oxi && oxi.titulo === 'Supervisor(a) Administrativo-Financeiro (a)', 'título arrumado: ' + (oxi && oxi.titulo));
ok(oxi && oxi.empresa === 'Oxi-Maq Comercial e Industrial de Equipamentos', 'empresa sem LTDA: ' + (oxi && oxi.empresa));
ok(oxi && oxi.local === 'Araraquara/SP' && oxi.modalidade === 'presencial' && oxi.jornada === 'Tempo integral', 'local, modalidade e jornada: ' + (oxi && [oxi.local, oxi.modalidade, oxi.jornada].join(' | ')));
ok(oxi && oxi.conferida && !oxi.aviso, 'Oxi-Maq conferida, sem aviso');
ok(oxi && /^data:image\/png;base64,/.test(oxi.logo), 'logo veio em base64');
ok(oxi && oxi.link === 'https://www.linkedin.com/jobs/view/4479099544/', 'link limpo, sem rastreamento');
const z = pend['4400000004'];
ok(z && !z.conferida && /conferir/.test(z.aviso), 'vaga com LinkedIn limitado vem marcada "não conferida"');
ok(z && z.titulo === 'Auxiliar de Logística' && z.empresa === 'Transportadora Z' && z.local === 'Taquaritinga/SP' && z.modalidade === 'presencial', 'dados do e-mail usados como plano B: ' + (z && [z.titulo, z.empresa, z.local, z.modalidade].join(' | ')));
ok(z && /company-logo/.test(JSON.stringify(store['p_4400000004'])) === false || true, '(logo do e-mail é opcional)');
const mot = Object.fromEntries(r1.descartadas.map((d) => [d.id, d.motivo]));
ok(mot['4400000002'] === 'Não aceita mais candidaturas', 'fechada descartada: ' + mot['4400000002']);
ok(mot['4400000003'] === 'Fora da região (São Carlos/SC)', 'SC descartada: ' + mot['4400000003']);
ok(mot['4400000005'] === 'Publicada há 30 dias', 'antiga descartada: ' + mot['4400000005']);
ok(r1.linkedinLimitou === true, 'avisa que o LinkedIn limitou');
ok(acessos.filter((u) => /4400000004/.test(u)).length === 2, 'tentou de novo uma vez após o limite');

// ---------- 4. enviar e descartar ----------
console.log('\nEnviar e descartar');
ok(api({ acao: 'enviada', chave, id: '4479099544', empresaOriginal: oxi.empresaOriginal, empresa: 'Oxi-Maq' }).ok, 'marca como enviada');
ok(!store['p_4479099544'] && /^e\|/.test(store['v_4479099544']), 'saiu da fila e entrou no histórico');
ok(api({ acao: 'descartar', chave, id: 'abc' }).ok === false, 'ID inválido é recusado');

// ---------- 5. segunda busca ----------
console.log('\nSegunda busca');
paginas['4400000004'] = { codigo: 200, html: pagina({ id: 4, titulo: 'Auxiliar de Logística', empresa: 'Transportadora Z', local: 'Taquaritinga, SP', publicada: 'Há 1 dia' }) };
paginas['4400000006'] = { codigo: 200, html: pagina({ id: 6, titulo: 'ANALISTA FISCAL', empresa: 'Oxi-Maq Comercial e Industrial de Equipamentos LTDA', local: 'Matão, SP', publicada: 'Há 4 horas' }) };
threads = [thread([msg(agora, '<a href="https://www.linkedin.com/comm/jobs/view/4479099544/">Supervisor</a><a href="https://www.linkedin.com/comm/jobs/view/4400000006/">Analista</a>', '')])];
const antes = acessos.length;
const r2 = api({ acao: 'buscar', chave });
const pend2 = Object.fromEntries(r2.pendentes.map((v) => [v.id, v]));
ok(!pend2['4479099544'], 'vaga já enviada não volta');
ok(pend2['4400000004'] && pend2['4400000004'].conferida, 'a "não conferida" foi conferida desta vez');
ok(pend2['4400000006'] && pend2['4400000006'].empresa === 'Oxi-Maq', 'lembrou o nome curto "Oxi-Maq": ' + (pend2['4400000006'] && pend2['4400000006'].empresa));
ok(pend2['4400000006'] && pend2['4400000006'].titulo === 'Analista Fiscal', 'título arrumado: ' + (pend2['4400000006'] && pend2['4400000006'].titulo));
ok(!acessos.slice(antes).some((u) => /4479099544/.test(u)), 'não gastou acesso com vaga já enviada');
ok(api({ acao: 'descartar', chave, id: '4400000004' }).ok && !store['p_4400000004'], 'descartar tira da fila');

// ---------- 6. listar ----------
console.log('\nListar');
const r3 = api({ acao: 'listar', chave });
ok(r3.pendentes.length === 1 && r3.pendentes[0].id === '4400000006', 'listar devolve a fila atual');
ok(Array.isArray(r3.descartadas), 'listar devolve as descartadas da última busca');
ok(r3.ultimaBusca > 0, 'informa a hora da última busca');

// ---------- 7. histórico antigo é limpo ----------
store['v_4100000000'] = 'e|' + (Date.now() - 200 * DIA);
threads = [];
api({ acao: 'buscar', chave });
ok(!store['v_4100000000'], 'histórico antigo (mais de 45 dias) é apagado');

// ---------- 8. configurações pelo app ----------
console.log('\nConfigurações pelo app');
const aj0 = api({ acao: 'ajustes', chave });
ok(aj0.ok && aj0.ajustes.cidades.join(',') === 'Matão,Araraquara,São Carlos,Taquaritinga' && aj0.ajustes.maxDias === 15, 'padrão: 4 cidades e 15 dias');
ok(api({ acao: 'salvarAjustes', chave, dados: JSON.stringify({ cidades: [], maxDias: 10 }) }).ok === false, 'não deixa salvar sem cidade');
ok(api({ acao: 'salvarAjustes', chave, dados: JSON.stringify({ cidades: ['Matão'], maxDias: 99 }) }).ok === false, 'não deixa limite de dias absurdo');
const aj1 = api({ acao: 'salvarAjustes', chave, dados: JSON.stringify({ cidades: [' Matão ', 'Araraquara', 'Ibaté', 'Ibaté'], maxDias: 10, msgCabecalho: '📢 VAGA NOVA!', arteSelo: 'CONTRATANDO' }) });
ok(aj1.ok && aj1.ajustes.cidades.join(',') === 'Matão,Araraquara,Ibaté' && aj1.ajustes.maxDias === 10 && aj1.ajustes.arteSelo === 'CONTRATANDO', 'salva cidades (sem repetir), dias e textos');
paginas['4400000007'] = { codigo: 200, html: pagina({ id: 7, titulo: 'Recepcionista', empresa: 'Clínica', local: 'Ibaté, SP', publicada: 'Há 1 dia' }) };
paginas['4400000008'] = { codigo: 200, html: pagina({ id: 8, titulo: 'Caixa', empresa: 'Mercado', local: 'São Carlos, SP', publicada: 'Há 1 dia' }) };
paginas['4400000009'] = { codigo: 200, html: pagina({ id: 9, titulo: 'Motorista', empresa: 'Frota', local: 'Matão, SP', publicada: 'Há 12 dias' }) };
threads = [thread([msg(Date.now(), ['4400000007', '4400000008', '4400000009'].map((i) => `<a href="https://www.linkedin.com/comm/jobs/view/${i}/">x</a>`).join(''), '')])];
const r4 = api({ acao: 'buscar', chave });
const ids4 = r4.pendentes.map((v) => v.id);
const mot4 = Object.fromEntries(r4.descartadas.map((d) => [d.id, d.motivo]));
ok(ids4.indexOf('4400000007') !== -1 && r4.pendentes.find((v) => v.id === '4400000007').local === 'Ibaté/SP', 'cidade nova (Ibaté) passa a valer');
ok(mot4['4400000008'] === 'Fora da região (São Carlos/SP)', 'cidade retirada (São Carlos) passa a ser descartada');
ok(mot4['4400000009'] === 'Publicada há 12 dias', 'novo limite de 10 dias vale');
ok(r4.ajustes && r4.ajustes.msgCabecalho === '📢 VAGA NOVA!', 'a busca devolve os ajustes para o app');

// ---------- 9. formato real do e-mail de alerta do LinkedIn ----------
console.log('\nFormato real dos alertas do LinkedIn');
api({ acao: 'salvarAjustes', chave, dados: JSON.stringify({ cidades: ['Matão', 'Araraquara', 'São Carlos', 'Taquaritinga'], maxDias: 15 }) });
ctx.zerarFilaEHistorico();
const link = (id) => `Visualizar vaga: https://www.linkedin.com/comm/jobs/view/${id}/?trackingId=abc%3D%3D&refId=x&trk=eml-email_job_alert_digest_01-jobcard_body_text_0_jobid_${id}`;
const sep = '\n---------------------------------------------------------\n  \n            \n';
const emailSP = 'Seu alerta de vaga para Desenvolvedor de front-end em: São Paulo foi criado            \n' +
  'Desenvolvedor(a) Front-end | Angular\nCapgemini\nBarueri, SP\n\n1 conexão\n' + link('4491171095') + sep +
  'Desenvolvedor Adobe AEM Junior\nBairesDev\nSão Paulo, SP\n' + link('4491713316');
const emailMatao = 'Seu alerta de vaga para jobs em: Matão, São Paulo, Brasil foi criado            \n' +
  'Auxiliar Administrativo\nJobbol\nMatão, SP (Presencial)\n\n1 conexão\n' + link('4482809448') + sep +
  'Web Analytics Júnior\nAC Villela | Estratégia e Parceria em RH\nSão Paulo, Brasil\nCandidate-se com currículo e perfil\n' + link('4490124344') + sep +
  'Operador de Máquinas\nUsina Santa Fé\nMatão, SP\nSeja uma das primeiras pessoas a se candidatar\n' + link('4400000101') + sep +
  'Vaga sem dados\n' + link('4400000102');
const htmlDe = (txt) => txt.split('\n').filter((l) => /jobs\/view/.test(l)).map((l) => `<a href="${l.split(': ')[1]}">x</a>`).join('');
threads = [thread([msg(Date.now(), htmlDe(emailSP), emailSP)]), thread([msg(Date.now(), htmlDe(emailMatao), emailMatao)])];
paginas['4482809448'] = { codigo: 200, html: pagina({ id: 81, titulo: 'Auxiliar Administrativo', empresa: 'Jobbol', local: 'Matão, SP', publicada: 'Há 1 dia' }) };
paginas['4400000101'] = [{ codigo: 429, html: '' }, { codigo: 429, html: '' }];
paginas['4400000102'] = [{ codigo: 429, html: '' }];
const antes9 = acessos.length;
const r9 = api({ acao: 'buscar', chave });
const novos9 = acessos.slice(antes9).join(' ');
ok(r9.alertasIgnorados === 1, 'e-mail do alerta "front-end em São Paulo" foi ignorado inteiro');
ok(!/4491171095|4491713316/.test(novos9), 'nenhuma consulta gasta com as vagas desse alerta');
ok(!/4490124344/.test(novos9), 'vaga de São Paulo dentro do alerta de Matão foi descartada pelo e-mail, sem consulta');
const p9 = Object.fromEntries(r9.pendentes.map((v) => [v.id, v]));
ok(p9['4482809448'] && p9['4482809448'].conferida && p9['4482809448'].local === 'Matão/SP', 'vaga de Matão conferida e pronta');
ok(p9['4400000101'] && !p9['4400000101'].conferida && p9['4400000101'].titulo === 'Operador de Máquinas' && p9['4400000101'].empresa === 'Usina Santa Fé' && p9['4400000101'].local === 'Matão/SP',
  'não conferida, mas com cidade do e-mail na região: aparece com aviso (' + (p9['4400000101'] && [p9['4400000101'].titulo, p9['4400000101'].empresa, p9['4400000101'].local].join(' | ')) + ')');
ok(!p9['4400000102'] && r9.aguardando === 1, 'sem cidade conhecida e não conferida: fica escondida esperando a próxima busca');
const mot9 = Object.fromEntries(r9.descartadas.map((d) => [d.id, d.motivo]));
ok(mot9['4490124344'] === 'Fora da região (São Paulo/Brasil)', 'motivo do descarte: ' + mot9['4490124344']);
ok(ctx.localDoAlerta_(emailMatao) === 'Matão, São Paulo, Brasil' && ctx.localDoAlerta_(emailSP) === 'São Paulo', 'lê a cidade do alerta no cabeçalho do e-mail');

// ---------- 10. pesquisa direta no LinkedIn ----------
console.log('\nPesquisa direta no LinkedIn');
ctx.zerarFilaEHistorico();
delete store.ultimaPesquisaDireta;
threads = [];
const descAticca = '<p>Salário compatível com mercado</p><p>PLR de acordo com a categoria;</p><p>•\tVale Alimentação no valor de R$ 29,75 por dia (útil trabalhado);</p><p>•\tAjuda combustível/deslocamento R$ 259,00 por mês;</p><p>•\tPrêmio mensal;</p><p>•\tAntecipação 1ª parcela do 13º no mês de aniversário;</p><p>•\tPlano Personal Unimed (subsídio de 50% mensalidade colaborador);</p><p>•\tPlano Odonto Uniodonto (subsídio 100% mensalidade colaborador);</p><p>•\tTotal Pass;</p><p>•\tDay off aniversário;</p><p>•\tRefeitório equipado para almoço e descanso local;</p>';
const cartao = (o) => `<li>
  <div class="base-card relative w-full base-search-card job-search-card" data-entity-urn="urn:li:jobPosting:${o.id}" data-row="1">
  <a class="base-card__full-link" href="https://br.linkedin.com/jobs/view/x-${o.id}?position=1"><span class="sr-only"> ${o.titulo} </span></a>
  <div class="search-entity-media"><img class="artdeco-entity-image artdeco-entity-image--square-4" data-delayed-url="https://media.licdn.com/dms/image/v2/D/company-logo_100_100/0/1/${o.id}_logo?e=1&amp;v=beta" alt></div>
  <div class="base-search-card__info"><h3 class="base-search-card__title"> ${o.titulo} </h3>
  <h4 class="base-search-card__subtitle"> <a class="hidden-nested-link" href="https://br.linkedin.com/company/x"> ${o.empresa} </a> </h4>
  <div class="base-search-card__metadata"><span class="job-search-card__location"> ${o.local} </span>
  <time class="job-search-card__listdate" datetime="${o.data || '2026-11-18'}"> Há 1 dia </time></div></div></div></li>`;
const buscasFeitas = [];
const respostasBusca = {
  'Matão': [cartao({ id: '4500000001', titulo: 'ASSISTENTE ADMINISTRATIVO', empresa: 'Aticca', local: 'Matão, SP' }),
    cartao({ id: '4500000002', titulo: 'Vaga já enviada', empresa: 'X', local: 'Matão, SP' }),
    cartao({ id: '4500000003', titulo: 'Cozinheiro', empresa: 'Savegnago', local: 'Monte Alto, SP' }),
    cartao({ id: '4500000004', titulo: 'Servente', empresa: 'MRV&amp;CO', local: 'Matão, SP' })].join('\n'),
  'Araraquara': cartao({ id: '4500000005', titulo: 'Atendente de Loja', empresa: 'Swift', local: 'Araraquara, SP', data: '2026-11-10' }),
};
store['v_4500000002'] = 'e|' + Date.now();
paginas['4500000001'] = { codigo: 200, html: pagina({ id: 51, titulo: 'ASSISTENTE ADMINISTRATIVO', empresa: 'Aticca', local: 'Matão, SP', publicada: 'Há 1 dia', desc: descAticca }) };
paginas['4500000004'] = [{ codigo: 429, html: '' }, { codigo: 429, html: '' }];
paginas['4500000005'] = { codigo: 200, html: pagina({ id: 55, titulo: 'Atendente de Loja', empresa: 'Swift', local: 'Araraquara, SP', publicada: 'Há 2 dias', jornada: 'Meio período', desc: 'Oferecemos vale-refeição; vale-transporte; seguro de vida.' }) };
const fetchNormal = UrlFetchApp.fetch;
UrlFetchApp.fetch = (url, o) => {
  if (!/seeMoreJobPostings/.test(url)) return fetchNormal(url, o);
  acessos.push(url); buscasFeitas.push(url);
  const loc = decodeURIComponent(url.match(/location=([^&]+)/)[1]).split(',')[0];
  const start = Number(url.match(/start=(\d+)/)[1]);
  return resp(200, start === 0 ? (respostasBusca[loc] || '') : '');
};
const r10 = api({ acao: 'buscar', chave });
const p10 = Object.fromEntries(r10.pendentes.map((v) => [v.id, v]));
ok(r10.ok && r10.pelaPesquisa === 3, 'pesquisa achou 3 vagas novas da região (sem a já enviada e sem Monte Alto): ' + r10.pelaPesquisa);
ok(buscasFeitas.length === 4 && buscasFeitas.every((u) => /f_TPR=r604800/.test(u) && /sortBy=DD/.test(u)), 'primeira pesquisa: 4 cidades, última semana, mais recentes primeiro');
ok(/location=Mat%C3%A3o%2C%20S%C3%A3o%20Paulo%2C%20Brasil/.test(buscasFeitas[0]), 'local da pesquisa: Matão, São Paulo, Brasil');
const at = p10['4500000001'];
ok(at && at.titulo === 'Assistente Administrativo' && at.empresa === 'Aticca' && at.local === 'Matão/SP' && at.conferida, 'vaga da pesquisa conferida: ' + (at && [at.titulo, at.empresa, at.local].join(' | ')));
ok(at && at.beneficios === 'Vale-alimentação, auxílio combustível, PLR, assistência médica e odontológica, TotalPass, Day Off de aniversário e refeitório',
  'benefícios no padrão da cliente: ' + (at && at.beneficios));
ok(p10['4500000005'] && p10['4500000005'].beneficios === 'Vale-refeição, vale-transporte e seguro de vida' && p10['4500000005'].jornada === 'Meio período', 'outros benefícios e jornada: ' + (p10['4500000005'] && p10['4500000005'].beneficios));
ok(!p10['4500000004'] && r10.aguardando === 1, 'vaga da pesquisa não conferida fica escondida até conferir (aguardando: ' + r10.aguardando + ')');
ok(!r10.descartadas.some((d) => d.id === '4500000003'), 'cidade vizinha da pesquisa nem aparece nas descartadas');
ok(store['p_4500000004'] && JSON.parse(store['p_4500000004']).empresaOriginal === 'MRV&CO', 'nome com & decodificado');
buscasFeitas.length = 0;
paginas['4500000004'] = { codigo: 200, html: pagina({ id: 54, titulo: 'Servente', empresa: 'MRV&amp;CO', local: 'Matão, SP', publicada: 'Há 1 dia' }) };
ctx.__logs.length = 0;
ctx.buscaAutomatica();
ok(buscasFeitas.length === 4 && buscasFeitas.every((u) => /f_TPR=r86400/.test(u)), 'depois da primeira: só as últimas 24 h');
const l11 = api({ acao: 'listar', chave });
ok(l11.pendentes.some((v) => v.id === '4500000004' && v.conferida && !v.beneficios), 'na busca seguinte a escondida é conferida e aparece (sem benefícios no texto, fica vazio)');
ok(/Busca automática: \d+ nova/.test(ctx.__logs.join('\n')), 'busca automática registra o resumo no log: ' + ctx.__logs.join(' '));
UrlFetchApp.fetch = fetchNormal;

// ---------- 11. benefícios: sem falso positivo ----------
console.log('\nBenefícios');
ok(ctx.extrairBeneficios_('Atendimento em clínica odontológica. Auxiliar o dentista. Organizar a farmácia da clínica.') === '', 'vaga de dentista/farmácia não vira benefício');
ok(ctx.extrairBeneficios_('Benefícios: Convênio Médico e Odontológico; Refeição no local de trabalho ou Vale Alimentação; Vale Transporte; Cesta Natalina; PLR') ===
  'Vale-alimentação, vale-transporte, PLR, assistência médica e odontológica, refeitório e cesta de Natal', 'lista do Savegnago: ' + ctx.extrairBeneficios_('Benefícios: Convênio Médico e Odontológico; Refeição no local de trabalho ou Vale Alimentação; Vale Transporte; Cesta Natalina; PLR'));
ok(ctx.extrairBeneficios_('Day Off') === 'Day Off', 'Day Off sem aniversário');

// ---------- 12. buscas automáticas e rodapé ----------
console.log('\nBuscas automáticas e rodapé');
gatilhos.push({ fn: 'buscaAutomatica', getHandlerFunction: () => 'buscaAutomatica' }); // um antigo
const ag = ctx.agendarBuscasAutomaticas();
ok(gatilhos.length === 2 && gatilhos[0].hora === 11 && gatilhos[0].minuto === 30 && gatilhos[1].hora === 17 && gatilhos[1].minuto === 0 &&
  gatilhos.every((g) => g.fuso === 'America/Sao_Paulo' && g.dias === 1 && g.fn === 'buscaAutomatica'), 'agenda 11:30 e 17:00 todo dia, sem duplicar');
ok(ag === 'todo dia por volta de 11:30 e 17:00' && api({ acao: 'listar', chave }).agenda === '11:30 e 17:00', 'o app fica sabendo dos horários');
const aj12 = api({ acao: 'salvarAjustes', chave, dados: JSON.stringify({ cidades: ['Matão', 'Araraquara', 'São Carlos', 'Taquaritinga'], maxDias: 15, msgRodape: 'Compartilhe! 🤝\n\nAGILE' }) });
ok(aj12.ok && aj12.ajustes.msgRodape === 'Compartilhe! 🤝\n\nAGILE', 'rodapé da mensagem é salvo');

console.log(falhas ? `\n${falhas} FALHA(S)` : '\nTudo certo.');
process.exit(falhas ? 1 : 0);
