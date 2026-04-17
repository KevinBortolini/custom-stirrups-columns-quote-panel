import "./style.css";

const app = document.querySelector("#app");

const STORAGE_KEY = "budget_panel_demo_v1";
const SELLER_STORAGE_KEY = "budget_panel_demo_seller";
const HISTORY_LIMIT = 100;

const DADOS_EMPRESA = {
  nome: "Atlas Metal Works Demo",
  cnpj: "00.000.000/0001-00",
  ie: "0000000000",
  endereco: "100 Demo Industrial Ave",
  cidade: "Sample City",
  uf: "SP",
  cep: "00000-000",
  telefone: "(11) 99999-0000",
  email: "quotes@atlas-demo.example",
  site: "www.atlas-demo.example",
};

let currentView = "editor";
let activeItemTab = "estribos";

let tokenAdmin = "";
let adminLiberado = false;
let adminPanelAberto = false;

let precoEstriboRet = "7,50";
let precoEstriboRed = "7,90";
let precoColunaRet = "7,50";
let precoColunaRed = "7,90";

let descontoPercent = "0";
let numeroOrcamento = null;
let criadoEmAtual = "";
let carregadoDoHistorico = false;
let alteradoDesdePersistencia = false;
let calculoAtualValido = false;

let e_formato = "retangular";
let e_bitola = "4.2";
let e_largura = "";
let e_comprimento = "";
let e_diametro = "";
let e_qtd = "";
let listaEstribos = [];

let c_formato = "retangular";
let c_bitolaFerro = "8";
let c_bitolaEstribo = "4.2";
let c_qtdColuna = "";
let c_esp = "23";
let c_largura = "";
let c_comprimento = "";
let c_qtdFerroRet = "4";
let c_diametro = "";
let c_qtdFerroRed = "6";
let listaColunas = [];

let resultadoEstribos = null;
let resultadoColunas = null;
let textoWhatsApp = "";
let mostrarTextoWhatsApp = false;

let tipoCliente = "consumidor";
let clienteNome = "";
let clienteTelefone = "";
let clienteEmail = "";
let enderecoEntrega = "";
let vendedorNome = "";
let dataOrcamento = new Date().toISOString().slice(0, 10);
let observacoesOrcamento = "";
let localActionMessage = "Current quote workflow.";

let feedback = null;
let loading = {
  calculating: false,
  saving: false,
  loadingHistory: false,
  quickHistory: false,
};

let quickHistoryItems = [];
let historyItems = [];
let historyFilters = {
  numero: "",
  cliente: "",
  vendedor: "",
  data: "",
  dataInicial: "",
  dataFinal: "",
};

function esc(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function brFloat(texto) {
  const t = String(texto ?? "").trim().replace(",", ".");
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

function parseBRL(s) {
  if (!s) return 0;
  const t = String(s).replace("R$", "").trim().replaceAll(".", "").replace(",", ".");
  const n = Number(t);
  return Number.isFinite(n) ? n : 0;
}

function formatarBRL(valor) {
  const s = Number(valor || 0).toFixed(2);
  const [i, d] = s.split(".");
  const iComPontos = i.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `R$ ${iComPontos},${d}`;
}

function formatarDataBR(isoYYYYMMDD) {
  if (!isoYYYYMMDD) return "";
  const [y, m, d] = String(isoYYYYMMDD).split("-");
  if (!y || !m || !d) return isoYYYYMMDD;
  return `${d}/${m}/${y}`;
}

function formatarDataHoraLocal(isoText) {
  if (!isoText) return "";
  const date = new Date(isoText);
  if (Number.isNaN(date.getTime())) return isoText;
  return date.toLocaleString("pt-BR");
}

function hojeHora() {
  const d = new Date();
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  const ss = String(d.getSeconds()).padStart(2, "0");
  return { data: `${dd}/${mm}/${yyyy}`, hora: `${hh}:${mi}:${ss}` };
}

function setFeedback(type, text) {
  feedback = text ? { type, text } : null;
  if (text) localActionMessage = text;
}

function limparFeedback() {
  feedback = null;
}

function getCurrentBudgetState() {
  if (!hasAnyBudgetData() && !numeroOrcamento && !calculoAtualValido) return "novo";
  if (numeroOrcamento && alteradoDesdePersistencia) return "alterado";
  if (numeroOrcamento && !alteradoDesdePersistencia) return "salvo";
  if (calculoAtualValido) return "calculado";
  return "nao_calculado";
}

function getStateMeta() {
  const state = getCurrentBudgetState();
  const map = {
    novo: { label: "New", tone: "neutral" },
    nao_calculado: { label: "Not calculated", tone: "warning" },
    calculado: { label: "Calculated", tone: "info" },
    salvo: { label: "Saved", tone: "success" },
    alterado: { label: "Modified", tone: "danger" },
  };
  return map[state];
}

function hasAnyBudgetData() {
  return Boolean(
    listaEstribos.length ||
      listaColunas.length ||
      clienteNome ||
      clienteTelefone ||
      clienteEmail ||
      enderecoEntrega ||
      vendedorNome ||
      observacoesOrcamento ||
      resultadoEstribos ||
      resultadoColunas
  );
}

function canGeneratePdf() {
  return Boolean(numeroOrcamento && !alteradoDesdePersistencia && calculoAtualValido);
}

function getResumoTotais() {
  const subtotalEstribos = resultadoEstribos?.total_geral ?? "R$ 0,00";
  const subtotalColunas = resultadoColunas?.total_geral ?? "R$ 0,00";
  const total = formatarBRL(parseBRL(subtotalEstribos) + parseBRL(subtotalColunas));
  return {
    subtotalEstribos,
    subtotalColunas,
    total,
    quantidadeItens: listaEstribos.length + listaColunas.length,
  };
}

function montarHeadersJson() {
  const headers = { "Content-Type": "application/json" };
  if (adminLiberado && tokenAdmin) headers["X-Admin-Token"] = tokenAdmin;
  return headers;
}

function salvarEstado() {
  const estado = {
    currentView,
    activeItemTab,
    listaEstribos,
    listaColunas,
    tipoCliente,
    clienteNome,
    clienteTelefone,
    clienteEmail,
    enderecoEntrega,
    vendedorNome,
    dataOrcamento,
    observacoesOrcamento,
    descontoPercent,
    tokenAdmin,
    adminLiberado,
    adminPanelAberto,
    e_formato,
    e_bitola,
    e_largura,
    e_comprimento,
    e_diametro,
    e_qtd,
    c_formato,
    c_bitolaFerro,
    c_bitolaEstribo,
    c_qtdColuna,
    c_esp,
    c_largura,
    c_comprimento,
    c_qtdFerroRet,
    c_diametro,
    c_qtdFerroRed,
    numeroOrcamento,
    criadoEmAtual,
    carregadoDoHistorico,
    alteradoDesdePersistencia,
    calculoAtualValido,
    resultadoEstribos,
    resultadoColunas,
    historyFilters,
    localActionMessage,
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(estado));
  localStorage.setItem(SELLER_STORAGE_KEY, vendedorNome || "");
}

function carregarEstado() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const s = JSON.parse(raw);
    currentView = s.currentView || currentView;
    activeItemTab = s.activeItemTab || activeItemTab;
    listaEstribos = Array.isArray(s.listaEstribos) ? s.listaEstribos : [];
    listaColunas = Array.isArray(s.listaColunas) ? s.listaColunas : [];
    tipoCliente = s.tipoCliente || tipoCliente;
    clienteNome = s.clienteNome || "";
    clienteTelefone = formatarTelefoneBR(s.clienteTelefone || "");
    clienteEmail = s.clienteEmail || "";
    enderecoEntrega = s.enderecoEntrega || "";
    vendedorNome = s.vendedorNome || "";
    dataOrcamento = s.dataOrcamento || dataOrcamento;
    observacoesOrcamento = s.observacoesOrcamento || "";
    descontoPercent = s.descontoPercent || descontoPercent;
    tokenAdmin = s.tokenAdmin || "";
    adminLiberado = Boolean(s.adminLiberado);
    adminPanelAberto = Boolean(s.adminPanelAberto);
    e_formato = s.e_formato || e_formato;
    e_bitola = s.e_bitola || e_bitola;
    e_largura = s.e_largura || "";
    e_comprimento = s.e_comprimento || "";
    e_diametro = s.e_diametro || "";
    e_qtd = s.e_qtd || "";
    c_formato = s.c_formato || c_formato;
    c_bitolaFerro = s.c_bitolaFerro || c_bitolaFerro;
    c_bitolaEstribo = s.c_bitolaEstribo || c_bitolaEstribo;
    c_qtdColuna = s.c_qtdColuna || "";
    c_esp = s.c_esp || c_esp;
    c_largura = s.c_largura || "";
    c_comprimento = s.c_comprimento || "";
    c_qtdFerroRet = s.c_qtdFerroRet || c_qtdFerroRet;
    c_diametro = s.c_diametro || "";
    c_qtdFerroRed = s.c_qtdFerroRed || c_qtdFerroRed;
    numeroOrcamento = s.numeroOrcamento ?? null;
    criadoEmAtual = s.criadoEmAtual || "";
    carregadoDoHistorico = Boolean(s.carregadoDoHistorico);
    alteradoDesdePersistencia = Boolean(s.alteradoDesdePersistencia);
    calculoAtualValido = Boolean(s.calculoAtualValido);
    resultadoEstribos = s.resultadoEstribos || null;
    resultadoColunas = s.resultadoColunas || null;
    historyFilters = { ...historyFilters, ...(s.historyFilters || {}) };
    localActionMessage = s.localActionMessage || localActionMessage;
    vendedorNome = localStorage.getItem(SELLER_STORAGE_KEY) || vendedorNome;
  } catch {
    // storage invalido: ignora e segue com estado limpo
  }
}

function formatarTelefoneBR(valor) {
  const digits = String(valor ?? "").replace(/\D/g, "").slice(0, 11);
  if (!digits) return "";
  if (digits.length <= 2) return `(${digits}`;
  if (digits.length <= 7) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}

function atualizarVendedor(valor) {
  vendedorNome = String(valor ?? "");
  localStorage.setItem(SELLER_STORAGE_KEY, vendedorNome);
  marcarAlterado();
}

function irParaEditor() {
  currentView = "editor";
  salvarEstado();
  renderApp();
}

function marcarAlterado({ invalidaCalculo = false } = {}) {
  if (numeroOrcamento) alteradoDesdePersistencia = true;
  if (invalidaCalculo) {
    calculoAtualValido = false;
    resultadoEstribos = null;
    resultadoColunas = null;
  }
  salvarEstado();
}

function resetarEditor() {
  activeItemTab = "estribos";
  descontoPercent = "0";
  numeroOrcamento = null;
  criadoEmAtual = "";
  carregadoDoHistorico = false;
  alteradoDesdePersistencia = false;
  calculoAtualValido = false;

  e_formato = "retangular";
  e_bitola = "4.2";
  e_largura = "";
  e_comprimento = "";
  e_diametro = "";
  e_qtd = "";
  listaEstribos = [];

  c_formato = "retangular";
  c_bitolaFerro = "8";
  c_bitolaEstribo = "4.2";
  c_qtdColuna = "";
  c_esp = "23";
  c_largura = "";
  c_comprimento = "";
  c_qtdFerroRet = "4";
  c_diametro = "";
  c_qtdFerroRed = "6";
  listaColunas = [];

  resultadoEstribos = null;
  resultadoColunas = null;
  textoWhatsApp = "";
  mostrarTextoWhatsApp = false;

  tipoCliente = "consumidor";
  clienteNome = "";
  clienteTelefone = "";
  clienteEmail = "";
  enderecoEntrega = "";
  vendedorNome = localStorage.getItem(SELLER_STORAGE_KEY) || vendedorNome || "";
  dataOrcamento = new Date().toISOString().slice(0, 10);
  observacoesOrcamento = "";
  localActionMessage = "New budget started.";
}

function confirmarPerdaContexto(mensagem = "Há alterações em andamento. Deseja continuar?") {
  if (!hasAnyBudgetData()) return true;
  if (!alteradoDesdePersistencia && !numeroOrcamento && !listaEstribos.length && !listaColunas.length) return true;
  return window.confirm(mensagem);
}

async function entrarAdmin() {
  const resp = await fetch("/api/admin/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: tokenAdmin }),
  });
  if (!resp.ok) throw new Error("Senha admin inválida.");
  adminLiberado = true;
  await carregarPrecosAdmin();
}

async function carregarPrecosAdmin() {
  const resp = await fetch("/api/admin/precos", {
    headers: { "X-Admin-Token": tokenAdmin },
  });
  if (!resp.ok) throw new Error("Não foi possível carregar os preços.");
  const dados = await resp.json();
  precoEstriboRet = String(dados.valor_kg_ferro_estribo_retangular).replace(".", ",");
  precoEstriboRed = String(dados.valor_kg_ferro_estribo_redondo).replace(".", ",");
  precoColunaRet = String(dados.valor_kg_ferro_coluna_ret).replace(".", ",");
  precoColunaRed = String(dados.valor_kg_ferro_coluna_red).replace(".", ",");
}

async function salvarPrecosAdmin() {
  const payload = {
    valor_kg_ferro_estribo_retangular: brFloat(precoEstriboRet),
    valor_kg_ferro_estribo_redondo: brFloat(precoEstriboRed),
    valor_kg_ferro_coluna_ret: brFloat(precoColunaRet),
    valor_kg_ferro_coluna_red: brFloat(precoColunaRed),
  };
  if (Object.values(payload).some((valor) => valor == null || valor <= 0)) {
    throw new Error("Preencha preços válidos.");
  }
  const resp = await fetch("/api/admin/precos", {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      "X-Admin-Token": tokenAdmin,
    },
    body: JSON.stringify(payload),
  });
  if (!resp.ok) throw new Error("Não foi possível salvar os preços.");
}

function obterPayloadSalvar() {
  const desconto = Number(String(descontoPercent).replace(",", "."));
  return {
    cliente: {
      tipo_cliente: tipoCliente,
      cliente_nome: clienteNome,
      cliente_telefone: clienteTelefone,
      cliente_email: clienteEmail,
      endereco_entrega: enderecoEntrega,
      vendedor_nome: vendedorNome,
      data_orcamento: dataOrcamento,
      observacoes: observacoesOrcamento,
      desconto_percent: Number.isFinite(desconto) ? desconto : 0,
    },
    estribos: listaEstribos,
    colunas: listaColunas,
  };
}

function validarDesconto() {
  const d = Number(String(descontoPercent).replace(",", "."));
  if (!Number.isFinite(d) || d < 0 || d > 20) {
    throw new Error("Desconto deve ser entre 0 e 20.");
  }
  return d;
}

async function calcularOrcamento() {
  validarDesconto();
  if (!listaEstribos.length && !listaColunas.length) {
    throw new Error("Add at least 1 item in Stirrups or Columns.");
  }

  loading.calculating = true;
  limparFeedback();
  renderApp();

  const desconto = Number(String(descontoPercent).replace(",", "."));
  const urlE = adminLiberado ? "/api/calculos/estribos?admin=true" : "/api/calculos/estribos";
  const urlC = adminLiberado ? "/api/calculos/colunas?admin=true" : "/api/calculos/colunas";

  try {
    if (listaEstribos.length) {
      const respE = await fetch(urlE, {
        method: "POST",
        headers: montarHeadersJson(),
        body: JSON.stringify({
          tipo_cliente: tipoCliente,
          desconto_percent: desconto,
          estribos: listaEstribos,
        }),
      });
      if (!respE.ok) throw new Error(`Stirrups (${respE.status}): ${await respE.text()}`);
      resultadoEstribos = await respE.json();
    } else {
      resultadoEstribos = null;
    }

    if (listaColunas.length) {
      const respC = await fetch(urlC, {
        method: "POST",
        headers: montarHeadersJson(),
        body: JSON.stringify({
          tipo_cliente: tipoCliente,
          desconto_percent: desconto,
          colunas: listaColunas,
        }),
      });
      if (!respC.ok) throw new Error(`Columns (${respC.status}): ${await respC.text()}`);
      resultadoColunas = await respC.json();
    } else {
      resultadoColunas = null;
    }

    calculoAtualValido = true;
    if (!numeroOrcamento) alteradoDesdePersistencia = false;
    setFeedback("success", "Quote calculated successfully.");
  } finally {
    loading.calculating = false;
    salvarEstado();
    renderApp();
  }
}

async function salvarOrcamento() {
  validarDesconto();
  if (!listaEstribos.length && !listaColunas.length) {
    throw new Error("Add at least 1 item before saving.");
  }
  if (!calculoAtualValido) {
    throw new Error("Calculate the quote before saving.");
  }

  loading.saving = true;
  limparFeedback();
  renderApp();

  try {
    const resp = await fetch("/api/orcamentos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(obterPayloadSalvar()),
    });
    if (!resp.ok) throw new Error(`Save error (${resp.status}): ${await resp.text()}`);
    const dados = await resp.json();
    numeroOrcamento = dados.numero_orcamento;
    criadoEmAtual = dados.criado_em;
    alteradoDesdePersistencia = false;
    carregadoDoHistorico = false;
    calculoAtualValido = true;
    setFeedback("success", `Quote #${numeroOrcamento} saved successfully.`);
    await carregarHistoricoRapido();
  } finally {
    loading.saving = false;
    salvarEstado();
    renderApp();
  }
}

async function carregarHistoricoRapido() {
  loading.quickHistory = true;
  try {
    const resp = await fetch("/api/orcamentos?limit=6");
    if (!resp.ok) throw new Error("Não foi possível carregar o histórico.");
    quickHistoryItems = await resp.json();
  } catch (error) {
    quickHistoryItems = [];
    setFeedback("warning", error?.message || String(error));
  } finally {
    loading.quickHistory = false;
    salvarEstado();
  }
}

async function pesquisarHistorico() {
  loading.loadingHistory = true;
  limparFeedback();
  renderApp();

  const params = new URLSearchParams();
  if (historyFilters.numero) params.set("numero", historyFilters.numero.trim());
  if (historyFilters.cliente) params.set("cliente", historyFilters.cliente.trim());
  if (historyFilters.vendedor) params.set("vendedor", historyFilters.vendedor.trim());
  if (historyFilters.data) params.set("data", historyFilters.data);
  if (historyFilters.dataInicial) params.set("data_inicial", historyFilters.dataInicial);
  if (historyFilters.dataFinal) params.set("data_final", historyFilters.dataFinal);
  params.set("limit", String(HISTORY_LIMIT));

  try {
    const resp = await fetch(`/api/orcamentos?${params.toString()}`);
    if (!resp.ok) throw new Error("Não foi possível buscar orçamentos.");
    historyItems = await resp.json();
    if (!historyItems.length) setFeedback("info", "No quotes found for the selected filters.");
  } finally {
    loading.loadingHistory = false;
    salvarEstado();
    renderApp();
  }
}

async function obterOrcamento(numero) {
  const resp = await fetch(`/api/orcamentos/${numero}`);
  if (!resp.ok) throw new Error("Quote not found.");
  return resp.json();
}

async function excluirOrcamento(numero) {
  const resp = await fetch(`/api/orcamentos/${numero}`, {
    method: "DELETE",
    headers: adminLiberado && tokenAdmin ? { "X-Admin-Token": tokenAdmin } : {},
  });
  if (!resp.ok) throw new Error(resp.status === 404 ? "Quote not found." : "Could not delete the quote.");
  return resp.json();
}

function hidratarOrcamentoSalvo(detalhe, { duplicar = false, gerarPdf = false } = {}) {
  const payload = detalhe.payload || {};
  const cliente = payload.cliente || {};

  tipoCliente = cliente.tipo_cliente || "consumidor";
  clienteNome = cliente.cliente_nome || "";
  clienteTelefone = formatarTelefoneBR(cliente.cliente_telefone || "");
  clienteEmail = cliente.cliente_email || "";
  enderecoEntrega = cliente.endereco_entrega || "";
  vendedorNome = cliente.vendedor_nome || "";
  localStorage.setItem(SELLER_STORAGE_KEY, vendedorNome || "");
  dataOrcamento = cliente.data_orcamento || new Date().toISOString().slice(0, 10);
  observacoesOrcamento = cliente.observacoes || "";
  descontoPercent = String(cliente.desconto_percent ?? 0);

  listaEstribos = Array.isArray(payload.estribos) ? payload.estribos : [];
  listaColunas = Array.isArray(payload.colunas) ? payload.colunas : [];

  if (duplicar) {
    numeroOrcamento = null;
    criadoEmAtual = "";
    carregadoDoHistorico = false;
    alteradoDesdePersistencia = false;
    calculoAtualValido = false;
    resultadoEstribos = null;
    resultadoColunas = null;
    setFeedback("info", "Quote loaded as the base for a new quote. Recalculate before saving.");
  } else {
    numeroOrcamento = detalhe.numero_orcamento;
    criadoEmAtual = detalhe.criado_em || "";
    carregadoDoHistorico = true;
    alteradoDesdePersistencia = false;
    calculoAtualValido = true;
    resultadoEstribos = payload.resultado_estribos || null;
    resultadoColunas = payload.resultado_colunas || null;
    if (!gerarPdf) setFeedback("success", `Quote #${numeroOrcamento} loaded for review.`);
  }

  currentView = "editor";
  activeItemTab = listaEstribos.length ? "estribos" : "colunas";
  salvarEstado();
  renderApp();
}

async function abrirOrcamento(numero, options = {}) {
  if (!options.skipConfirm && !confirmarPerdaContexto("Deseja trocar o orçamento atual pelo orçamento selecionado?")) {
    return;
  }
  limparFeedback();
  renderApp();
  const detalhe = await obterOrcamento(numero);
  hidratarOrcamentoSalvo(detalhe, options);
  if (options.gerarPdf) {
    imprimirPDFSimples("Budget Panel - Custom Stirrups and Columns", resultadoEstribos, resultadoColunas);
  }
}

function duplicarComoNovo(numero) {
  return abrirOrcamento(numero, { duplicar: true, skipConfirm: false });
}

function baixarArquivo(nome, conteudo, mime) {
  const blob = new Blob([conteudo], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nome;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function gerarCSVOrcamento(resE, resC) {
  const rows = [];
  rows.push(["Tipo", "Item", "Descrição", "Quantidade", "Valor Unitário", "Valor Total"].join(";"));

  function add(tipo, res) {
    if (!res) return;
    for (const r of res.tabela || []) {
      rows.push([
        tipo,
        r.item,
        `"${String(r.descricao).replaceAll('"', '""')}"`,
        r.quantidade,
        r.valor_unitario,
        r.valor_total,
      ].join(";"));
    }
    rows.push([tipo, "", "SUBTOTAL", "", "", res.total_geral].join(";"));
  }

  add("ESTRIBOS", resE);
  add("COLUNAS", resC);
  return rows.join("\n");
}

function gerarTextoWhatsApp(resE, resC) {
  const linhas = [];
  linhas.push("ORÇAMENTO");
  linhas.push(`Client type: ${tipoCliente === "revenda" ? "Reseller" : "End customer"}`);
  if (clienteNome) linhas.push(`Client: ${clienteNome}`);
  if (clienteTelefone) linhas.push(`Telefone: ${clienteTelefone}`);
  if (clienteEmail) linhas.push(`Email: ${clienteEmail}`);
  if (enderecoEntrega) linhas.push(`Endereço Entrega: ${enderecoEntrega}`);
  if (vendedorNome) linhas.push(`Sales rep: ${vendedorNome}`);
  if (dataOrcamento) linhas.push(`Data: ${dataOrcamento}`);
  linhas.push("Validade: 1 dia");
  linhas.push("");

  if (resE) {
    linhas.push(`ESTRIBOS (Subtotal: ${resE.total_geral})`);
    for (const r of resE.tabela || []) {
      linhas.push(`- ${r.descricao} | Qtd: ${r.quantidade} | Unit: ${r.valor_unitario} | Total: ${r.valor_total}`);
    }
  }

  if (resC) {
    linhas.push("");
    linhas.push(`COLUNAS (Subtotal: ${resC.total_geral})`);
    for (const r of resC.tabela || []) {
      linhas.push(`- ${r.descricao} | Qtd: ${r.quantidade} | Unit: ${r.valor_unitario} | Total: ${r.valor_total}`);
    }
  }

  linhas.push("");
  linhas.push(`TOTAL GERAL: ${getResumoTotais().total}`);
  if (observacoesOrcamento) {
    linhas.push("");
    linhas.push(`OBSERVAÇÕES: ${observacoesOrcamento}`);
  }

  return linhas.join("\n");
}

function linhasItensPDF(resE, resC) {
  const linhas = [];
  const push = (tipo, res) => {
    if (!res?.tabela) return;
    for (const r of res.tabela) {
      linhas.push({
        tipo,
        descricao: r.descricao,
        quantidade: r.quantidade,
        valor_unitario: r.valor_unitario,
        icms_st: r.icms_st ?? "",
        valor_total: r.valor_total,
      });
    }
  };
  push("ESTRIBOS", resE);
  push("COLUNAS", resC);
  return linhas;
}

function imprimirPDFSimples(titulo, resE, resC) {
  const { data, hora } = hojeHora();
  const linhas = linhasItensPDF(resE, resC);
  const mostrarIcms = linhas.some((x) => (x.icms_st || "").trim() !== "");

  const subtotalEstribos = resE?.total_geral ?? "R$ 0,00";
  const subtotalColunas = resC?.total_geral ?? "R$ 0,00";
  const totalGeralFmt = formatarBRL(parseBRL(subtotalEstribos) + parseBRL(subtotalColunas));
  const emissao = formatarDataBR(dataOrcamento) || data;

  const linhasHtml = linhas
    .map((x, idx) => {
      const icmsTd = mostrarIcms ? `<td class="td right">${x.icms_st || ""}</td>` : "";
      return `
        <tr>
          <td class="td center">${idx + 1}</td>
          <td class="td">${x.descricao}</td>
          <td class="td center">${x.quantidade}</td>
          <td class="td right">${x.valor_unitario}</td>
          ${icmsTd}
          <td class="td right">${x.valor_total}</td>
        </tr>
      `;
    })
    .join("");

  const w = window.open("", "_blank");
  w.document.write(`
    <html>
      <head>
        <meta charset="utf-8" />
        <title>${titulo}</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 18px; color:#000; }
          .top { display:grid; grid-template-columns: 1fr 2fr 1fr; align-items:start; border-bottom:2px solid #000; padding-bottom:8px; }
          .top-left { display:flex; justify-content:flex-start; }
          .top-center { text-align:center; }
          .top-right { text-align:right; }
          .top h1 { margin:0; font-size:28px; font-style:italic; }
          .num { font-size:18px; font-weight:700; }
          .logo { height:58px; width:auto; }
          .small { font-size:12px; }
          .grid2 { display:grid; grid-template-columns: 1fr 1fr; gap:10px; margin-top:10px; }
          .box { border:1px solid #000; }
          .box .hdr { background:#e9f2fb; text-align:center; font-size:12px; padding:4px 6px; border-bottom:1px solid #000; }
          .box .content { padding:8px; font-size:12px; }
          .row { display:flex; gap:8px; flex-wrap:wrap; }
          .label { font-weight:700; }
          table { width:100%; border-collapse:collapse; margin-top:10px; font-size:12px; }
          .th, .td { border:1px solid #000; padding:6px 6px; }
          .th { background:#f2f2f2; }
          .right { text-align:right; }
          .center { text-align:center; }
          .totals { width:360px; margin-left:auto; margin-top:8px; border:1px solid #000; }
          .totals .line { display:flex; justify-content:space-between; padding:6px 8px; border-bottom:1px solid #000; font-size:12px; }
          .totals .line:last-child { border-bottom:none; font-weight:800; }
          .obs { margin-top:10px; border:1px solid #000; }
          .obs .hdr { background:#f2f2f2; padding:6px 8px; font-weight:700; border-bottom:1px solid #000; font-size:12px; }
          .obs .content { padding:8px; font-size:12px; min-height:40px; white-space:pre-wrap; }
        </style>
      </head>
      <body>
        <div class="top">
          <div class="top-left">
            <img src="${window.location.origin}/demo-mark.svg" class="logo" alt="Logo" />
          </div>
          <div class="top-center">
            <h1>Quote</h1>
            <div class="small">
              <span class="label">Issued:</span> ${emissao}
              &nbsp;&nbsp;
              <span class="label">Valid for:</span> 1 day
            </div>
          </div>
          <div class="top-right">
            <div class="num">No: <span>${numeroOrcamento ?? ""}</span></div>
            <div class="small"><span class="label">Time:</span> ${hora}</div>
          </div>
        </div>

        <div class="grid2">
          <div class="box">
            <div class="hdr">Company</div>
            <div class="content">
              <div><span class="label">Company:</span> ${DADOS_EMPRESA.nome}</div>
              <div><span class="label">Address:</span> ${DADOS_EMPRESA.endereco}</div>
              <div class="row">
                <div><span class="label">City:</span> ${DADOS_EMPRESA.cidade}</div>
                <div><span class="label">State:</span> ${DADOS_EMPRESA.uf}</div>
                <div><span class="label">Postal code:</span> ${DADOS_EMPRESA.cep}</div>
              </div>
              <div class="row">
                <div><span class="label">Tax ID:</span> ${DADOS_EMPRESA.cnpj}</div>
                <div><span class="label">State registration:</span> ${DADOS_EMPRESA.ie}</div>
              </div>
              <div class="row">
                <div><span class="label">Phone:</span> ${DADOS_EMPRESA.telefone}</div>
                <div><span class="label">Email:</span> ${DADOS_EMPRESA.email}</div>
              </div>
              <div><span class="label">Website:</span> ${DADOS_EMPRESA.site}</div>
            </div>
          </div>

          <div class="box">
            <div class="hdr">Client Details</div>
            <div class="content">
              <div><span class="label">Client:</span> ${esc(clienteNome)}</div>
              <div class="row">
                <div><span class="label">Phone:</span> ${esc(clienteTelefone)}</div>
                <div><span class="label">Email:</span> ${esc(clienteEmail)}</div>
              </div>
              <div><span class="label">Delivery address:</span> ${esc(enderecoEntrega)}</div>
              <div class="row">
                <div><span class="label">Sales rep:</span> ${esc(vendedorNome)}</div>
                <div><span class="label">Client type:</span> ${tipoCliente === "revenda" ? "Reseller" : "End customer"}</div>
              </div>
              <div><span class="label">Quote validity:</span> 1 day</div>
            </div>
          </div>
        </div>

        <table>
          <thead>
            <tr>
              <th class="th center" style="width:40px;">N.</th>
              <th class="th">Product Description</th>
              <th class="th center" style="width:70px;">Qty.</th>
              <th class="th right" style="width:95px;">Unit Price</th>
              ${mostrarIcms ? `<th class="th right" style="width:105px;">ICMS-ST</th>` : ""}
              <th class="th right" style="width:120px;">Total</th>
            </tr>
          </thead>
          <tbody>
            ${linhasHtml || `<tr><td class="td" colspan="${mostrarIcms ? 6 : 5}">No items.</td></tr>`}
          </tbody>
        </table>

        <div class="totals">
          <div class="line"><span>Total items</span><span>${linhas.length}</span></div>
          <div class="line"><span>Stirrups subtotal</span><span>${subtotalEstribos}</span></div>
          <div class="line"><span>Columns subtotal</span><span>${subtotalColunas}</span></div>
          <div class="line"><span>Total</span><span>${totalGeralFmt}</span></div>
        </div>

        <div class="obs">
          <div class="hdr">Notes</div>
          <div class="content">${esc(observacoesOrcamento)}</div>
        </div>

        <script>window.onload = () => { window.print(); };</script>
      </body>
    </html>
  `);
  w.document.close();
}

function renderFeedback() {
  if (!feedback) return "";
  return `<div class="feedback feedback--${feedback.type}">${esc(feedback.text)}</div>`;
}

function renderHeader() {
  return `
    <header class="app-header">
      <div class="app-brand">
        <img src="/demo-mark.svg" alt="Logo" class="app-brand__logo" />
        <div>
          <h1>Budget Panel for Custom Stirrups and Columns</h1>
          <p>Operational dashboard for quote calculation, persistence, and history lookup.</p>
        </div>
      </div>
      <div class="header-actions">
        <button class="btn btn--soft" id="btnVoltarHeader">Back</button>
        <button class="btn btn--soft" id="btnNovoHeader">New quote</button>
        <button class="btn btn--soft" id="btnHistoricoHeader">History</button>
        <button class="btn btn--soft" id="btnAdminToggle">Admin</button>
        <label class="header-seller">
          <span>Sales rep</span>
          <input id="vendedorTopo" value="${esc(vendedorNome)}" placeholder="Sales rep" />
        </label>
      </div>
    </header>
  `;
}

function renderToolbar() {
  return `
    <section class="toolbar">
      <div class="toolbar__item">
        <span class="toolbar__label">Mode</span>
        <strong>${adminLiberado ? "Admin enabled" : "Operation"}</strong>
      </div>
      <div class="toolbar__item">
        <span class="toolbar__label">Quote</span>
        <strong>${numeroOrcamento ? `#${numeroOrcamento}` : "No number"}</strong>
      </div>
      <div class="toolbar__item">
        <span class="toolbar__label">Source</span>
        <strong>${carregadoDoHistorico ? "History" : "Current"}</strong>
      </div>
      <div class="toolbar__item">
        <span class="toolbar__label">Created at</span>
        <strong>${criadoEmAtual ? formatarDataHoraLocal(criadoEmAtual) : "—"}</strong>
      </div>
    </section>
  `;
}

function renderStatusBanner() {
  const meta = getStateMeta();
  return `
    <div class="status-banner">
      <span class="badge badge--${meta.tone}">${meta.label}</span>
      ${carregadoDoHistorico ? `<span class="badge badge--ghost">Loaded from history</span>` : ""}
      ${alteradoDesdePersistencia ? `<span class="banner-note">Current edits require saving as a new quote.</span>` : ""}
    </div>
  `;
}

function renderClientCard() {
  return `
    <section class="card">
      <div class="card__header">
        <div>
          <h2>Client details</h2>
          <p>Commercial and contact information for the current quote.</p>
        </div>
      </div>
      <div class="form-grid form-grid--client">
        <label class="field">
          <span>Client type</span>
          <select id="tipoCliente">
            <option value="consumidor" ${tipoCliente === "consumidor" ? "selected" : ""}>End customer</option>
            <option value="revenda" ${tipoCliente === "revenda" ? "selected" : ""}>Reseller</option>
          </select>
        </label>
        <label class="field">
          <span>Client</span>
          <input id="clienteNome" value="${esc(clienteNome)}" />
        </label>
        <label class="field">
          <span>Phone</span>
          <input id="clienteTelefone" value="${esc(clienteTelefone)}" placeholder="(00) 00000-0000" />
        </label>
        <label class="field">
          <span>Email</span>
          <input id="clienteEmail" value="${esc(clienteEmail)}" />
        </label>
        <label class="field field--wide">
          <span>Delivery address</span>
          <input id="enderecoEntrega" value="${esc(enderecoEntrega)}" />
        </label>
        <label class="field">
          <span>Sales rep</span>
          <input id="vendedorNome" value="${esc(vendedorNome)}" />
        </label>
        <label class="field">
          <span>Date</span>
          <input id="dataOrcamento" type="date" value="${esc(dataOrcamento)}" />
        </label>
        <label class="field">
          <span>General discount %</span>
          <input id="descontoPercent" value="${esc(descontoPercent)}" placeholder="0 a 20" />
        </label>
        <label class="field field--wide">
          <span>Notes</span>
          <textarea id="observacoesOrcamento" rows="3">${esc(observacoesOrcamento)}</textarea>
        </label>
      </div>
    </section>
  `;
}

function renderTabSwitcher() {
  return `
    <div class="tab-switcher">
      <button class="tab ${activeItemTab === "estribos" ? "tab--active" : ""}" id="btnTabEstribos">Stirrups</button>
      <button class="tab ${activeItemTab === "colunas" ? "tab--active" : ""}" id="btnTabColunas">Columns</button>
    </div>
  `;
}

function renderEstribosForm() {
  return `
    <div class="form-grid">
      <label class="field">
        <span>Format</span>
        <select id="e_formato">
          <option value="retangular" ${e_formato === "retangular" ? "selected" : ""}>Rectangular</option>
          <option value="redondo" ${e_formato === "redondo" ? "selected" : ""}>Round</option>
        </select>
      </label>
      <label class="field">
        <span>Gauge</span>
        <select id="e_bitola">
          <option value="4.2" ${e_bitola === "4.2" ? "selected" : ""}>4.2mm</option>
          <option value="5.0" ${e_bitola === "5.0" ? "selected" : ""}>5.0mm</option>
          <option value="6.3" ${e_bitola === "6.3" ? "selected" : ""}>6.3mm</option>
        </select>
      </label>
      <label class="field ${e_formato === "retangular" ? "" : "is-hidden"}" id="eFieldLargura">
        <span>Width (cm)</span>
        <input id="e_largura" value="${esc(e_largura)}" />
      </label>
      <label class="field ${e_formato === "retangular" ? "" : "is-hidden"}" id="eFieldComprimento">
        <span>Length (cm)</span>
        <input id="e_comprimento" value="${esc(e_comprimento)}" />
      </label>
      <label class="field ${e_formato === "redondo" ? "" : "is-hidden"}" id="eFieldDiametro">
        <span>Diameter (cm)</span>
        <input id="e_diametro" value="${esc(e_diametro)}" />
      </label>
      <label class="field">
        <span>Quantity (units)</span>
        <input id="e_qtd" value="${esc(e_qtd)}" />
      </label>
      <div class="form-actions">
        <button class="btn btn--primary" id="btnAddEstribo">Add item</button>
        <button class="btn btn--soft" id="btnClearEstribos">Clear list</button>
      </div>
    </div>
  `;
}

function renderColunasForm() {
  const isRet = c_formato === "retangular";
  return `
    <div class="form-grid">
      <label class="field">
        <span>Format</span>
        <select id="c_formato">
          <option value="retangular" ${c_formato === "retangular" ? "selected" : ""}>Rectangular</option>
          <option value="redonda" ${c_formato === "redonda" ? "selected" : ""}>Round</option>
        </select>
      </label>
      <label class="field">
        <span>Main bar gauge</span>
        <select id="c_bitolaFerro">
          <option value="6" ${c_bitolaFerro === "6" ? "selected" : ""}>6.3mm (1/4")</option>
          <option value="8" ${c_bitolaFerro === "8" ? "selected" : ""}>8mm (5/16")</option>
          <option value="10" ${c_bitolaFerro === "10" ? "selected" : ""}>10mm (3/8")</option>
          <option value="12" ${c_bitolaFerro === "12" ? "selected" : ""}>12.5mm (1/2")</option>
        </select>
      </label>
      <label class="field">
        <span>Stirrup gauge</span>
        <select id="c_bitolaEstribo">
          <option value="4.2" ${c_bitolaEstribo === "4.2" ? "selected" : ""}>4.2mm</option>
          <option value="5.0" ${c_bitolaEstribo === "5.0" ? "selected" : ""}>5.0mm</option>
          <option value="6.3" ${c_bitolaEstribo === "6.3" ? "selected" : ""}>6.3mm</option>
        </select>
      </label>
      <label class="field ${isRet ? "" : "is-hidden"}">
        <span>Width 1 (cm)</span>
        <input id="c_largura" value="${esc(c_largura)}" />
      </label>
      <label class="field ${isRet ? "" : "is-hidden"}">
        <span>Width 2 (cm)</span>
        <input id="c_comprimento" value="${esc(c_comprimento)}" />
      </label>
      <label class="field ${isRet ? "is-hidden" : ""}">
        <span>Diameter (cm)</span>
        <input id="c_diametro" value="${esc(c_diametro)}" />
      </label>
      <label class="field">
        <span>Column quantity</span>
        <input id="c_qtdColuna" value="${esc(c_qtdColuna)}" />
      </label>
      <label class="field ${isRet ? "" : "is-hidden"}">
        <span>Main bars per column</span>
        <input id="c_qtdFerroRet" value="${esc(c_qtdFerroRet)}" />
      </label>
      <label class="field ${isRet ? "is-hidden" : ""}">
        <span>Main bars per column</span>
        <input id="c_qtdFerroRed" value="${esc(c_qtdFerroRed)}" />
      </label>
      <label class="field">
        <span>Stirrup spacing (cm)</span>
        <input id="c_esp" value="${esc(c_esp)}" />
      </label>
      <div class="form-actions">
        <button class="btn btn--primary" id="btnAddColuna">Add item</button>
        <button class="btn btn--soft" id="btnClearColunas">Clear list</button>
      </div>
    </div>
  `;
}

function renderCurrentItemsTable() {
  const items = activeItemTab === "estribos" ? listaEstribos : listaColunas;
  const rows = items
    .map((item, index) => {
      if (activeItemTab === "estribos") {
        const medidas = item.formato === "retangular"
          ? `${item.largura_cm} x ${item.comprimento_cm} cm`
          : `Ø ${item.diametro_cm} cm`;
        return `
          <tr>
            <td>${index + 1}</td>
            <td>${esc(item.formato)} ${esc(item.bitola_mm)}mm</td>
            <td>${esc(medidas)}</td>
            <td class="cell-right">${esc(item.quantidade)}</td>
            <td class="cell-actions"><button class="btn btn--ghost btn--small" data-remove-estribo="${index}">Remove</button></td>
          </tr>
        `;
      }
      const medidas = item.formato_coluna === "retangular"
        ? `${item.largura_coluna_cm} x ${item.comprimento_coluna_cm} cm • ${item.quantidade_ferro_ret} ferros`
        : `Ø ${item.diametro_coluna_cm} cm • ${item.quantidade_ferro_red} ferros`;
      return `
        <tr>
          <td>${index + 1}</td>
          <td>${esc(item.formato_coluna)} • Ferro ${esc(item.bitola_ferro_mm)} / Estribo ${esc(item.bitola_estribo_mm)}</td>
          <td>${esc(medidas)}</td>
          <td class="cell-right">${esc(item.quantidade_coluna)}</td>
          <td class="cell-actions"><button class="btn btn--ghost btn--small" data-remove-coluna="${index}">Remove</button></td>
        </tr>
      `;
    })
    .join("");

  return `
    <section class="card">
      <div class="card__header">
        <div>
          <h2>${activeItemTab === "estribos" ? "Stirrup items" : "Column items"}</h2>
          <p>Items added to the current tab.</p>
        </div>
      </div>
      <div class="table-wrap">
        <table class="table">
          <thead>
            <tr>
              <th>#</th>
              <th>Description</th>
              <th>Dimensions</th>
              <th class="cell-right">Qty</th>
              <th class="cell-actions">Action</th>
            </tr>
          </thead>
          <tbody>
            ${rows || `<tr><td colspan="5" class="table-empty">No items added in this tab.</td></tr>`}
          </tbody>
        </table>
      </div>
    </section>
  `;
}

function renderResultsTable(res, titulo) {
  if (!res) return "";
  const temIcms = res.tabela?.some((x) => x.icms_st != null);
  const temPeso = res.tabela?.some((x) => x.peso_unit_kg != null);
  const linhas = (res.tabela || [])
    .map((r) => `
      <tr>
        <td>${r.item}</td>
        <td>${esc(r.descricao)}</td>
        <td class="cell-right">${esc(r.quantidade)}</td>
        <td class="cell-right">${esc(r.valor_unitario)}</td>
        ${temIcms ? `<td class="cell-right">${esc(r.icms_st ?? "")}</td>` : ""}
        <td class="cell-right">${esc(r.valor_total)}</td>
        ${temPeso ? `<td class="cell-right">${esc(r.peso_unit_kg ?? "")}</td><td class="cell-right">${esc(r.peso_total_kg ?? "")}</td>` : ""}
      </tr>
    `)
    .join("");

  return `
    <div class="result-block">
      <div class="result-block__header">
        <h3>${titulo}</h3>
        <strong>${esc(res.total_geral)}</strong>
      </div>
      <div class="table-wrap">
        <table class="table table--compact">
          <thead>
            <tr>
              <th>Item</th>
              <th>Description</th>
              <th class="cell-right">Qty</th>
              <th class="cell-right">Unit.</th>
              ${temIcms ? `<th class="cell-right">ICMS-ST</th>` : ""}
              <th class="cell-right">Total</th>
              ${temPeso ? `<th class="cell-right">Unit weight</th><th class="cell-right">Total weight</th>` : ""}
            </tr>
          </thead>
          <tbody>${linhas}</tbody>
        </table>
      </div>
    </div>
  `;
}

function renderResultsCard() {
  const resumo = getResumoTotais();
  return `
    <section class="card">
      <div class="card__header">
        <div>
          <h2>Consolidated result</h2>
          <p>Calculated output for the current quote.</p>
        </div>
        <strong class="total-highlight">${resumo.total}</strong>
      </div>
      ${
        !resultadoEstribos && !resultadoColunas
          ? `<div class="empty-state">Calculate the quote to view subtotals, grand total, and the consolidated table.</div>`
          : `
            <div class="result-summary-grid">
              <div class="summary-box"><span>Stirrups subtotal</span><strong>${resumo.subtotalEstribos}</strong></div>
              <div class="summary-box"><span>Columns subtotal</span><strong>${resumo.subtotalColunas}</strong></div>
              <div class="summary-box"><span>Grand total</span><strong>${resumo.total}</strong></div>
            </div>
            ${renderResultsTable(resultadoEstribos, "Stirrups")}
            ${renderResultsTable(resultadoColunas, "Columns")}
            ${mostrarTextoWhatsApp ? renderTextoWhatsApp() : ""}
          `
      }
    </section>
  `;
}

function renderTextoWhatsApp() {
  return `
    <section class="inline-panel">
      <div class="inline-panel__header">
        <h3>WhatsApp text</h3>
        <div class="inline-panel__actions">
          <button class="btn btn--soft btn--small" id="btnBaixarTxt">Download .txt</button>
          <button class="btn btn--ghost btn--small" id="btnFecharTxt">Close</button>
        </div>
      </div>
      <textarea class="text-preview" id="txtWhats">${esc(textoWhatsApp)}</textarea>
    </section>
  `;
}

function renderBudgetStatusCard() {
  const meta = getStateMeta();
  return `
    <section class="card card--sidebar">
      <div class="card__header">
        <div>
          <h2>Quote status</h2>
          <p>Visual indicator for the current quote lifecycle.</p>
        </div>
      </div>
      <div class="status-card">
        <span class="badge badge--${meta.tone}">${meta.label}</span>
        ${carregadoDoHistorico ? `<span class="badge badge--ghost">History</span>` : ""}
        <div class="status-card__line"><span>Number</span><strong>${numeroOrcamento ? `#${numeroOrcamento}` : "—"}</strong></div>
        <div class="status-card__line"><span>Created at</span><strong>${criadoEmAtual ? formatarDataHoraLocal(criadoEmAtual) : "—"}</strong></div>
        <div class="status-card__line"><span>Quote date</span><strong>${dataOrcamento ? formatarDataBR(dataOrcamento) : "—"}</strong></div>
      </div>
    </section>
  `;
}

function renderSummaryCard() {
  const resumo = getResumoTotais();
  return `
    <section class="card card--sidebar">
      <div class="card__header">
        <div>
          <h2>Summary</h2>
          <p>Quick view of the current totals.</p>
        </div>
      </div>
      <div class="summary-list">
        <div class="summary-list__row"><span>Items</span><strong>${resumo.quantidadeItens}</strong></div>
        <div class="summary-list__row"><span>Stirrups subtotal</span><strong>${resumo.subtotalEstribos}</strong></div>
        <div class="summary-list__row"><span>Columns subtotal</span><strong>${resumo.subtotalColunas}</strong></div>
        <div class="summary-list__row summary-list__row--total"><span>Grand total</span><strong>${resumo.total}</strong></div>
      </div>
    </section>
  `;
}

function renderActionFeedbackCard() {
  if (!feedback?.text) return "";
  return `
    <section class="card card--sidebar card--action-feedback card--action-feedback-${feedback.type}">
      <div class="feedback feedback--${feedback.type} feedback--inline">
        ${esc(feedback.text)}
      </div>
    </section>
  `;
}

function renderPrimaryActionsCard() {
  return `
    <section class="card card--sidebar">
      <div class="card__header">
        <div>
          <h2>Primary actions</h2>
          <p>Current quote workflow.</p>
        </div>
      </div>
      <div class="action-stack">
        <button class="btn btn--primary" id="btnCalcularSidebar" ${loading.calculating ? "disabled" : ""}>
          ${loading.calculating ? "Calculating..." : "Calculate quote"}
        </button>
        <button class="btn btn--success" id="btnSalvarSidebar" ${loading.saving ? "disabled" : ""}>
          ${loading.saving ? "Saving..." : "Save quote"}
        </button>
        <button class="btn btn--soft" id="btnPdfSidebar" ${canGeneratePdf() ? "" : "disabled"}>Generate PDF</button>
        <button class="btn btn--soft" id="btnWhatsSidebar" ${(resultadoEstribos || resultadoColunas) ? "" : "disabled"}>Generate text</button>
        <button class="btn btn--soft" id="btnExcelSidebar" ${(resultadoEstribos || resultadoColunas) ? "" : "disabled"}>Download CSV</button>
      </div>
      <div class="hint-box">
        ${canGeneratePdf()
          ? "PDF is available because the quote is saved and has no pending changes."
          : "PDF is enabled only for a saved quote with no pending changes."}
      </div>
    </section>
  `;
}

function renderAdminCard() {
  if (!adminPanelAberto) return "";
  return `
    <section class="card card--sidebar">
      <div class="card__header">
        <div>
          <h2>Admin</h2>
          <p>Authentication and internal pricing controls.</p>
        </div>
      </div>
      <div class="form-grid">
        <label class="field field--wide">
          <span>Admin token</span>
          <input id="tokenAdmin" type="password" value="${esc(tokenAdmin)}" placeholder="Admin token" />
        </label>
        <div class="form-actions form-actions--inline">
          <button class="btn btn--soft" id="btnEntrarAdmin">Sign in</button>
          <button class="btn btn--ghost" id="btnSairAdmin">Sign out</button>
        </div>
      </div>
      ${
        adminLiberado
          ? `
            <div class="form-grid">
              <label class="field"><span>Rect. stirrup</span><input id="precoEstriboRet" value="${esc(precoEstriboRet)}" /></label>
              <label class="field"><span>Round stirrup</span><input id="precoEstriboRed" value="${esc(precoEstriboRed)}" /></label>
              <label class="field"><span>Rect. column</span><input id="precoColunaRet" value="${esc(precoColunaRet)}" /></label>
              <label class="field"><span>Round column</span><input id="precoColunaRed" value="${esc(precoColunaRed)}" /></label>
              <div class="form-actions"><button class="btn btn--soft" id="btnSalvarPrecosAdmin">Update prices</button></div>
            </div>
          `
          : `<div class="hint-box">Only authenticated users can view and change internal prices.</div>`
      }
    </section>
  `;
}

function renderQuickHistoryCard() {
  const rows = quickHistoryItems
    .map((item) => `
      <div class="history-quick__item">
        <div>
          <strong>#${item.numero_orcamento}</strong>
          <div>${esc(item.cliente_nome || "No client")} • ${esc(formatarDataBR(item.data_orcamento) || "No date")}</div>
          <div class="history-quick__meta">${esc(item.total_geral || "—")}</div>
        </div>
        <div class="history-quick__actions">
          <button class="btn btn--ghost btn--small" data-open-budget="${item.numero_orcamento}">Open</button>
          <button class="btn btn--ghost btn--small" data-pdf-budget="${item.numero_orcamento}">PDF</button>
        </div>
      </div>
    `)
    .join("");

  return `
    <section class="card card--sidebar">
      <div class="card__header">
        <div>
          <h2>Quick history</h2>
          <p>Latest saved quotes.</p>
        </div>
      </div>
      <div class="quick-history-search">
        <input id="quickHistoryNumero" placeholder="Search by number" />
        <button class="btn btn--soft btn--small" id="btnIrHistorico">Full history</button>
      </div>
      <div class="history-quick">
        ${loading.quickHistory ? `<div class="empty-state">Loading history...</div>` : rows || `<div class="empty-state">No saved quotes yet.</div>`}
      </div>
    </section>
  `;
}

function renderEditorPage() {
  return `
    ${renderFeedback()}
    <div class="layout">
      <main class="editor-column">
        ${renderStatusBanner()}
        ${renderClientCard()}
        <section class="card">
          <div class="card__header">
            <div>
              <h2>Quote items</h2>
              <p>Register stirrups or columns and build the quote composition.</p>
            </div>
          </div>
          ${renderTabSwitcher()}
          <div class="tab-panel">
            ${activeItemTab === "estribos" ? renderEstribosForm() : renderColunasForm()}
          </div>
        </section>
        ${renderCurrentItemsTable()}
        ${renderResultsCard()}
      </main>
      <aside class="sidebar-column">
        ${renderAdminCard()}
        ${renderBudgetStatusCard()}
        ${renderSummaryCard()}
        ${renderActionFeedbackCard()}
        ${renderPrimaryActionsCard()}
        ${renderQuickHistoryCard()}
      </aside>
    </div>
  `;
}

function renderHistoryPage() {
  const rows = historyItems
    .map((item) => `
      <tr>
        <td>#${item.numero_orcamento}</td>
        <td>${esc(item.cliente_nome || "No client")}</td>
        <td>${esc(formatarDataBR(item.data_orcamento) || "—")}</td>
        <td>${esc(item.vendedor_nome || "—")}</td>
        <td>${esc(item.total_geral || "—")}</td>
        <td>${esc(formatarDataHoraLocal(item.criado_em) || "—")}</td>
        <td class="cell-actions">
          <button class="btn btn--ghost btn--small" data-open-budget="${item.numero_orcamento}">Open</button>
          <button class="btn btn--ghost btn--small" data-pdf-budget="${item.numero_orcamento}">PDF</button>
          <button class="btn btn--ghost btn--small" data-duplicate-budget="${item.numero_orcamento}">Duplicate as new</button>
          ${adminLiberado ? `<button class="btn btn--danger-ghost btn--small btn--icon" title="Delete quote" data-delete-budget="${item.numero_orcamento}">×</button>` : ""}
        </td>
      </tr>
    `)
    .join("");

  return `
    ${renderFeedback()}
    <section class="history-page">
      <div class="history-page__header">
        <div>
          <h2>Quote history</h2>
          <p>Search, open for review, regenerate the PDF, or duplicate as a new quote.</p>
        </div>
        <div class="header-actions">
          <button class="btn btn--soft" id="btnVoltarEditor">Back to editor</button>
          <button class="btn btn--primary" id="btnNovoPeloHistorico">New quote</button>
        </div>
      </div>
      <section class="card">
        <div class="card__header">
          <div>
            <h2>Filters</h2>
            <p>Search by number, client, seller, and date range.</p>
          </div>
        </div>
        <div class="form-grid form-grid--history">
          <label class="field"><span>Number</span><input id="historyNumero" value="${esc(historyFilters.numero)}" /></label>
          <label class="field"><span>Client</span><input id="historyCliente" value="${esc(historyFilters.cliente)}" /></label>
          <label class="field"><span>Sales rep</span><input id="historyVendedor" value="${esc(historyFilters.vendedor)}" /></label>
          <label class="field"><span>Date</span><input id="historyData" type="date" value="${esc(historyFilters.data)}" /></label>
          <label class="field"><span>Start date</span><input id="historyDataInicial" type="date" value="${esc(historyFilters.dataInicial)}" /></label>
          <label class="field"><span>End date</span><input id="historyDataFinal" type="date" value="${esc(historyFilters.dataFinal)}" /></label>
          <div class="form-actions form-actions--inline">
            <button class="btn btn--primary" id="btnPesquisarHistorico">${loading.loadingHistory ? "Searching..." : "Search"}</button>
            <button class="btn btn--soft" id="btnLimparFiltrosHistorico">Clear</button>
          </div>
        </div>
      </section>
      <section class="card">
        <div class="card__header">
          <div>
            <h2>Results</h2>
            <p>${historyItems.length} quote(s) listed.</p>
          </div>
        </div>
        <div class="table-wrap">
          <table class="table">
            <thead>
              <tr>
                <th>Number</th>
                <th>Client</th>
                <th>Date</th>
                <th>Sales rep</th>
                <th>Total</th>
                <th>Created at</th>
                <th class="cell-actions">Actions</th>
              </tr>
            </thead>
            <tbody>
              ${rows || `<tr><td colspan="6" class="table-empty">No quotes found.</td></tr>`}
            </tbody>
          </table>
        </div>
      </section>
    </section>
  `;
}

function renderApp() {
  app.innerHTML = `
    <div class="shell">
      ${renderHeader()}
      ${renderToolbar()}
      ${currentView === "editor" ? renderEditorPage() : renderHistoryPage()}
    </div>
  `;
  bindCommonEvents();
  if (currentView === "editor") bindEditorEvents();
  else bindHistoryEvents();
}

function bindCommonEvents() {
  document.querySelector("#btnVoltarHeader")?.addEventListener("click", () => {
    irParaEditor();
  });

  document.querySelector("#btnNovoHeader")?.addEventListener("click", () => {
    if (!confirmarPerdaContexto("Start a new quote?")) return;
    resetarEditor();
    setFeedback("info", "Novo orçamento iniciado.");
    irParaEditor();
  });

  document.querySelector("#btnHistoricoHeader")?.addEventListener("click", async () => {
    currentView = "history";
    salvarEstado();
    renderApp();
    await pesquisarHistorico();
  });

  document.querySelector("#btnAdminToggle")?.addEventListener("click", () => {
    adminPanelAberto = !adminPanelAberto;
    salvarEstado();
    renderApp();
  });

  document.querySelector("#vendedorTopo")?.addEventListener("input", (ev) => {
    atualizarVendedor(ev.target.value);
    const inputClienteVendedor = document.querySelector("#vendedorNome");
    if (inputClienteVendedor) inputClienteVendedor.value = vendedorNome;
    salvarEstado();
  });
}

function bindEditorEvents() {
  bindClientEvents();
  bindItemTabEvents();
  bindItemFormEvents();
  bindCurrentItemsEvents();
  bindSidebarEvents();
  bindQuickHistoryEvents();
  bindAdminEvents();
}

function bindClientEvents() {
  document.querySelector("#tipoCliente")?.addEventListener("change", (ev) => {
    tipoCliente = ev.target.value;
    marcarAlterado({ invalidaCalculo: true });
    renderApp();
  });
  document.querySelector("#clienteNome")?.addEventListener("input", (ev) => {
    clienteNome = ev.target.value;
    marcarAlterado();
  });
  document.querySelector("#clienteTelefone")?.addEventListener("input", (ev) => {
    clienteTelefone = formatarTelefoneBR(ev.target.value);
    ev.target.value = clienteTelefone;
    marcarAlterado();
  });
  document.querySelector("#clienteEmail")?.addEventListener("input", (ev) => {
    clienteEmail = ev.target.value;
    marcarAlterado();
  });
  document.querySelector("#enderecoEntrega")?.addEventListener("input", (ev) => {
    enderecoEntrega = ev.target.value;
    marcarAlterado();
  });
  document.querySelector("#vendedorNome")?.addEventListener("input", (ev) => {
    atualizarVendedor(ev.target.value);
    const inputTopoVendedor = document.querySelector("#vendedorTopo");
    if (inputTopoVendedor) inputTopoVendedor.value = vendedorNome;
    salvarEstado();
  });
  document.querySelector("#dataOrcamento")?.addEventListener("input", (ev) => {
    dataOrcamento = ev.target.value;
    marcarAlterado();
  });
  document.querySelector("#observacoesOrcamento")?.addEventListener("input", (ev) => {
    observacoesOrcamento = ev.target.value;
    marcarAlterado();
  });
  document.querySelector("#descontoPercent")?.addEventListener("input", (ev) => {
    descontoPercent = ev.target.value;
    marcarAlterado({ invalidaCalculo: true });
    renderApp();
  });
}

function bindItemTabEvents() {
  document.querySelector("#btnTabEstribos")?.addEventListener("click", () => {
    activeItemTab = "estribos";
    salvarEstado();
    renderApp();
  });
  document.querySelector("#btnTabColunas")?.addEventListener("click", () => {
    activeItemTab = "colunas";
    salvarEstado();
    renderApp();
  });
}

function bindItemFormEvents() {
  if (activeItemTab === "estribos") {
    document.querySelector("#e_formato")?.addEventListener("change", (ev) => {
      e_formato = ev.target.value;
      salvarEstado();
      renderApp();
    });
    document.querySelector("#e_bitola")?.addEventListener("change", (ev) => { e_bitola = ev.target.value; salvarEstado(); });
    document.querySelector("#e_largura")?.addEventListener("input", (ev) => { e_largura = ev.target.value; salvarEstado(); });
    document.querySelector("#e_comprimento")?.addEventListener("input", (ev) => { e_comprimento = ev.target.value; salvarEstado(); });
    document.querySelector("#e_diametro")?.addEventListener("input", (ev) => { e_diametro = ev.target.value; salvarEstado(); });
    document.querySelector("#e_qtd")?.addEventListener("input", (ev) => { e_qtd = ev.target.value; salvarEstado(); });

    document.querySelector("#btnAddEstribo")?.addEventListener("click", () => {
      try {
        const qtd = parseInt(e_qtd, 10);
        if (!Number.isFinite(qtd) || qtd <= 0) throw new Error("Invalid quantity.");
        const item = { formato: e_formato, bitola_mm: Number(e_bitola), quantidade: qtd };
        if (e_formato === "retangular") {
          const l = parseInt(e_largura, 10);
          const c = parseInt(e_comprimento, 10);
          if (!Number.isFinite(l) || l <= 0 || !Number.isFinite(c) || c <= 0) {
            throw new Error("Invalid width or length.");
          }
          item.largura_cm = l;
          item.comprimento_cm = c;
        } else {
          const d = parseInt(e_diametro, 10);
          if (!Number.isFinite(d) || d <= 0) throw new Error("Invalid diameter.");
          item.diametro_cm = d;
        }
        listaEstribos.push(item);
        e_largura = "";
        e_comprimento = "";
        e_diametro = "";
        e_qtd = "";
        marcarAlterado({ invalidaCalculo: true });
        setFeedback("success", "Stirrup added to the list.");
        renderApp();
      } catch (error) {
        setFeedback("danger", error?.message || String(error));
        renderApp();
      }
    });

    document.querySelector("#btnClearEstribos")?.addEventListener("click", () => {
      listaEstribos = [];
      marcarAlterado({ invalidaCalculo: true });
      setFeedback("info", "Stirrup list cleared.");
      renderApp();
    });
  } else {
    document.querySelector("#c_formato")?.addEventListener("change", (ev) => {
      c_formato = ev.target.value;
      salvarEstado();
      renderApp();
    });
    document.querySelector("#c_bitolaFerro")?.addEventListener("change", (ev) => { c_bitolaFerro = ev.target.value; salvarEstado(); });
    document.querySelector("#c_bitolaEstribo")?.addEventListener("change", (ev) => { c_bitolaEstribo = ev.target.value; salvarEstado(); });
    document.querySelector("#c_qtdColuna")?.addEventListener("input", (ev) => { c_qtdColuna = ev.target.value; salvarEstado(); });
    document.querySelector("#c_esp")?.addEventListener("input", (ev) => { c_esp = ev.target.value; salvarEstado(); });
    document.querySelector("#c_largura")?.addEventListener("input", (ev) => { c_largura = ev.target.value; salvarEstado(); });
    document.querySelector("#c_comprimento")?.addEventListener("input", (ev) => { c_comprimento = ev.target.value; salvarEstado(); });
    document.querySelector("#c_qtdFerroRet")?.addEventListener("input", (ev) => { c_qtdFerroRet = ev.target.value; salvarEstado(); });
    document.querySelector("#c_diametro")?.addEventListener("input", (ev) => { c_diametro = ev.target.value; salvarEstado(); });
    document.querySelector("#c_qtdFerroRed")?.addEventListener("input", (ev) => { c_qtdFerroRed = ev.target.value; salvarEstado(); });

    document.querySelector("#btnAddColuna")?.addEventListener("click", () => {
      try {
        const qtdCol = parseInt(c_qtdColuna, 10);
        const esp = parseInt(c_esp, 10);
        if (!Number.isFinite(qtdCol) || qtdCol <= 0) throw new Error("Invalid column quantity.");
        if (!Number.isFinite(esp) || esp <= 0) throw new Error("Invalid spacing.");

        const item = {
          formato_coluna: c_formato,
          bitola_ferro_mm: Number(c_bitolaFerro),
          bitola_estribo_mm: Number(c_bitolaEstribo),
          quantidade_coluna: qtdCol,
          espacamento_estribo_cm: esp,
        };

        if (c_formato === "retangular") {
          const l = parseInt(c_largura, 10);
          const cc = parseInt(c_comprimento, 10);
          const qf = parseInt(c_qtdFerroRet, 10);
          if (!Number.isFinite(l) || l <= 0 || !Number.isFinite(cc) || cc <= 0 || !Number.isFinite(qf) || qf <= 0) {
            throw new Error("Invalid width, length, or bar quantity.");
          }
          item.largura_coluna_cm = l;
          item.comprimento_coluna_cm = cc;
          item.quantidade_ferro_ret = qf;
        } else {
          const d = parseInt(c_diametro, 10);
          const qf = parseInt(c_qtdFerroRed, 10);
          if (!Number.isFinite(d) || d <= 0 || !Number.isFinite(qf) || qf <= 0) {
            throw new Error("Invalid diameter or bar quantity.");
          }
          item.diametro_coluna_cm = d;
          item.quantidade_ferro_red = qf;
        }
        listaColunas.push(item);
        c_qtdColuna = "";
        c_largura = "";
        c_comprimento = "";
        c_diametro = "";
        marcarAlterado({ invalidaCalculo: true });
        setFeedback("success", "Column added to the list.");
        renderApp();
      } catch (error) {
        setFeedback("danger", error?.message || String(error));
        renderApp();
      }
    });

    document.querySelector("#btnClearColunas")?.addEventListener("click", () => {
      listaColunas = [];
      marcarAlterado({ invalidaCalculo: true });
      setFeedback("info", "Column list cleared.");
      renderApp();
    });
  }
}

function bindCurrentItemsEvents() {
  document.querySelectorAll("[data-remove-estribo]").forEach((btn) => {
    btn.addEventListener("click", (ev) => {
      const idx = Number(ev.currentTarget.dataset.removeEstribo);
      listaEstribos.splice(idx, 1);
      marcarAlterado({ invalidaCalculo: true });
      setFeedback("info", "Stirrup removed.");
      renderApp();
    });
  });

  document.querySelectorAll("[data-remove-coluna]").forEach((btn) => {
    btn.addEventListener("click", (ev) => {
      const idx = Number(ev.currentTarget.dataset.removeColuna);
      listaColunas.splice(idx, 1);
      marcarAlterado({ invalidaCalculo: true });
      setFeedback("info", "Column removed.");
      renderApp();
    });
  });
}

function bindSidebarEvents() {
  document.querySelector("#btnCalcularSidebar")?.addEventListener("click", async () => {
    try {
      await calcularOrcamento();
    } catch (error) {
      setFeedback("danger", error?.message || String(error));
      renderApp();
    }
  });

  document.querySelector("#btnSalvarSidebar")?.addEventListener("click", async () => {
    try {
      await salvarOrcamento();
    } catch (error) {
      setFeedback("danger", error?.message || String(error));
      renderApp();
    }
  });

  document.querySelector("#btnPdfSidebar")?.addEventListener("click", () => {
    if (!canGeneratePdf()) {
      setFeedback("warning", "Save the quote without pending changes before generating a PDF.");
      renderApp();
      return;
    }
    imprimirPDFSimples("Budget Panel - Custom Stirrups and Columns", resultadoEstribos, resultadoColunas);
  });

  document.querySelector("#btnWhatsSidebar")?.addEventListener("click", () => {
    if (!resultadoEstribos && !resultadoColunas) {
      setFeedback("warning", "Calculate the quote first.");
      renderApp();
      return;
    }
    textoWhatsApp = gerarTextoWhatsApp(resultadoEstribos, resultadoColunas);
    mostrarTextoWhatsApp = true;
    salvarEstado();
    renderApp();
  });

  document.querySelector("#btnExcelSidebar")?.addEventListener("click", () => {
    if (!resultadoEstribos && !resultadoColunas) {
      setFeedback("warning", "Calculate the quote first.");
      renderApp();
      return;
    }
    const csv = gerarCSVOrcamento(resultadoEstribos, resultadoColunas);
    baixarArquivo("orcamento_estribos_colunas.csv", csv, "text/csv;charset=utf-8");
  });

  document.querySelector("#btnBaixarTxt")?.addEventListener("click", () => {
    baixarArquivo("orcamento_whatsapp.txt", textoWhatsApp, "text/plain;charset=utf-8");
  });

  document.querySelector("#btnFecharTxt")?.addEventListener("click", () => {
    mostrarTextoWhatsApp = false;
    salvarEstado();
    renderApp();
  });
}

function bindQuickHistoryEvents() {
  document.querySelector("#btnIrHistorico")?.addEventListener("click", async () => {
    currentView = "history";
    salvarEstado();
    renderApp();
    await pesquisarHistorico();
  });

  document.querySelector("#quickHistoryNumero")?.addEventListener("keydown", async (ev) => {
    if (ev.key !== "Enter") return;
    const numero = ev.target.value.trim();
    currentView = "history";
    historyFilters.numero = numero;
    salvarEstado();
    renderApp();
    await pesquisarHistorico();
  });

  document.querySelectorAll("[data-open-budget]").forEach((btn) => {
    btn.addEventListener("click", async (ev) => {
      try {
        await abrirOrcamento(Number(ev.currentTarget.dataset.openBudget));
      } catch (error) {
        setFeedback("danger", error?.message || String(error));
        renderApp();
      }
    });
  });

  document.querySelectorAll("[data-pdf-budget]").forEach((btn) => {
    btn.addEventListener("click", async (ev) => {
      try {
        await abrirOrcamento(Number(ev.currentTarget.dataset.pdfBudget), { gerarPdf: true });
      } catch (error) {
        setFeedback("danger", error?.message || String(error));
        renderApp();
      }
    });
  });
}

function bindAdminEvents() {
  document.querySelector("#tokenAdmin")?.addEventListener("input", (ev) => {
    tokenAdmin = ev.target.value;
    salvarEstado();
  });
  document.querySelector("#btnEntrarAdmin")?.addEventListener("click", async () => {
    try {
      await entrarAdmin();
      setFeedback("success", "Admin mode enabled.");
      salvarEstado();
      renderApp();
    } catch (error) {
      adminLiberado = false;
      setFeedback("danger", error?.message || String(error));
      renderApp();
    }
  });
  document.querySelector("#btnSairAdmin")?.addEventListener("click", () => {
    adminLiberado = false;
    tokenAdmin = "";
    setFeedback("info", "Admin mode closed.");
    salvarEstado();
    renderApp();
  });

  document.querySelector("#precoEstriboRet")?.addEventListener("input", (ev) => { precoEstriboRet = ev.target.value; });
  document.querySelector("#precoEstriboRed")?.addEventListener("input", (ev) => { precoEstriboRed = ev.target.value; });
  document.querySelector("#precoColunaRet")?.addEventListener("input", (ev) => { precoColunaRet = ev.target.value; });
  document.querySelector("#precoColunaRed")?.addEventListener("input", (ev) => { precoColunaRed = ev.target.value; });

  document.querySelector("#btnSalvarPrecosAdmin")?.addEventListener("click", async () => {
    try {
      await salvarPrecosAdmin();
      setFeedback("success", "Internal prices updated.");
      salvarEstado();
      renderApp();
    } catch (error) {
      setFeedback("danger", error?.message || String(error));
      renderApp();
    }
  });
}

function bindHistoryEvents() {
  document.querySelector("#btnVoltarEditor")?.addEventListener("click", () => {
    irParaEditor();
  });
  document.querySelector("#btnNovoPeloHistorico")?.addEventListener("click", () => {
    if (!confirmarPerdaContexto("Start a new quote?")) return;
    resetarEditor();
    currentView = "editor";
    setFeedback("info", "Novo orçamento iniciado.");
    salvarEstado();
    renderApp();
  });

  document.querySelector("#historyNumero")?.addEventListener("input", (ev) => { historyFilters.numero = ev.target.value; salvarEstado(); });
  document.querySelector("#historyCliente")?.addEventListener("input", (ev) => { historyFilters.cliente = ev.target.value; salvarEstado(); });
  document.querySelector("#historyVendedor")?.addEventListener("input", (ev) => { historyFilters.vendedor = ev.target.value; salvarEstado(); });
  document.querySelector("#historyData")?.addEventListener("input", (ev) => { historyFilters.data = ev.target.value; salvarEstado(); });
  document.querySelector("#historyDataInicial")?.addEventListener("input", (ev) => { historyFilters.dataInicial = ev.target.value; salvarEstado(); });
  document.querySelector("#historyDataFinal")?.addEventListener("input", (ev) => { historyFilters.dataFinal = ev.target.value; salvarEstado(); });

  document.querySelector("#btnPesquisarHistorico")?.addEventListener("click", async () => {
    try {
      await pesquisarHistorico();
    } catch (error) {
      setFeedback("danger", error?.message || String(error));
      renderApp();
    }
  });

  document.querySelector("#btnLimparFiltrosHistorico")?.addEventListener("click", async () => {
    historyFilters = { numero: "", cliente: "", vendedor: "", data: "", dataInicial: "", dataFinal: "" };
    salvarEstado();
    renderApp();
    await pesquisarHistorico();
  });

  document.querySelectorAll("[data-open-budget]").forEach((btn) => {
    btn.addEventListener("click", async (ev) => {
      try {
        await abrirOrcamento(Number(ev.currentTarget.dataset.openBudget));
      } catch (error) {
        setFeedback("danger", error?.message || String(error));
        renderApp();
      }
    });
  });

  document.querySelectorAll("[data-pdf-budget]").forEach((btn) => {
    btn.addEventListener("click", async (ev) => {
      try {
        await abrirOrcamento(Number(ev.currentTarget.dataset.pdfBudget), { gerarPdf: true });
      } catch (error) {
        setFeedback("danger", error?.message || String(error));
        renderApp();
      }
    });
  });

  document.querySelectorAll("[data-duplicate-budget]").forEach((btn) => {
    btn.addEventListener("click", async (ev) => {
      try {
        await duplicarComoNovo(Number(ev.currentTarget.dataset.duplicateBudget));
      } catch (error) {
        setFeedback("danger", error?.message || String(error));
        renderApp();
      }
    });
  });

  document.querySelectorAll("[data-delete-budget]").forEach((btn) => {
    btn.addEventListener("click", async (ev) => {
      const numero = Number(ev.currentTarget.dataset.deleteBudget);
      if (!adminLiberado) return;
      const ok = window.confirm(`Delete quote #${numero} permanently? This action cannot be undone.`);
      if (!ok) return;
      try {
        await excluirOrcamento(numero);
        if (numeroOrcamento === numero) {
          numeroOrcamento = null;
          criadoEmAtual = "";
          carregadoDoHistorico = false;
          alteradoDesdePersistencia = true;
        }
        quickHistoryItems = quickHistoryItems.filter((item) => item.numero_orcamento !== numero);
        historyItems = historyItems.filter((item) => item.numero_orcamento !== numero);
        setFeedback("success", `Quote #${numero} deleted successfully.`);
        salvarEstado();
        renderApp();
      } catch (error) {
        setFeedback("danger", error?.message || String(error));
        renderApp();
      }
    });
  });
}

async function init() {
  carregarEstado();
  renderApp();
  await carregarHistoricoRapido();
  renderApp();
  if (currentView === "history") await pesquisarHistorico();
}

init();
