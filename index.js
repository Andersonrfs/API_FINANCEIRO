const express = require("express");

const app = express();
app.use(express.json());

app.get("/health", (req, res) => {
  res.status(200).json({ servico: "financas-familia", versao: "1.0.0" });
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

app.post("/lancamentos", (req, res) => {
  const { valor, descricao } = req.body || {};
  const numero = converterValor(valor);

  if (!Number.isFinite(numero) || numero <= 0) {
    return res.status(400).json({ erro: "valor_invalido" });
  }

  res.status(201).json({ criado: true, valor: numero, descricao });
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
