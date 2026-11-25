const express = require("express");

const app = express();
app.use(express.json());

app.get("/health", (req, res) => {
  res.status(200).json({ servico: "financas-familia", versao: "1.0.0" });
});

app.get("/status", (req, res) => {
  res.status(200).json({
    nome: "financas-familia",
    versao: "1.0.0",
    hora: new Date().toISOString(),
  });
});

function converterValor(bruto) {
  if (typeof bruto === "number") return bruto;
  if (typeof bruto !== "string") return NaN;
  const texto = bruto.trim();

  // Milhar com ponto: "1.234", "1.234,56", "1.234.567,89"
  // (o primeiro grupo nao comeca com zero, entao "0.500" continua sendo 0.5)
  if (/^[1-9]\d{0,2}(\.\d{3})+(,\d+)?$/.test(texto)) {
    return Number(texto.replace(/\./g, "").replace(",", "."));
  }

  // Decimal simples: "89.05", "89,05", "1234,56", "89", "0.5"
  // (sem zero a esquerda: "01.234" e "089" sao recusados)
  if (/^(0|[1-9]\d*)([.,]\d+)?$/.test(texto)) {
    return Number(texto.replace(",", "."));
  }

  return NaN;
}

// Data no formato AAAA-MM-DD e que exista no calendario ("2026-02-30" nao)
function dataValida(data) {
  if (typeof data !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(data)) {
    return false;
  }
  const convertida = new Date(data + "T00:00:00Z");
  return !isNaN(convertida) && convertida.toISOString().slice(0, 10) === data;
}

app.post("/lancamentos", (req, res) => {
  const { valor, descricao, data } = req.body || {};
  const numero = converterValor(valor);
  const campos = [];

  if (!Number.isFinite(numero) || numero <= 0) campos.push("valor");
  if (typeof descricao !== "string" || descricao.trim() === "") {
    campos.push("descricao");
  }
  if (!dataValida(data)) campos.push("data");

  if (campos.length > 0) {
    return res.status(400).json({ erro: "campos_invalidos", campos });
  }

  res.status(201).json({
    criado: true,
    valor: numero,
    descricao: descricao.trim(),
    data,
  });
});

// JSON malformado no corpo: responde em JSON em vez da pagina HTML padrao
app.use((err, req, res, next) => {
  if (err.type === "entity.parse.failed") {
    return res.status(400).json({ erro: "json_invalido" });
  }
  res.status(500).json({ erro: "erro_interno" });
});

app.listen(3000, () => {
  console.log("financas-familia ouvindo na porta 3000");
});
