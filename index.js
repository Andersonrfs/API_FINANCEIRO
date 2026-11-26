const path = require("path");
require("dotenv").config({ path: path.join(__dirname, ".env"), quiet: true });

const express = require("express");
const { createClient, isAuthApiError } = require("@supabase/supabase-js");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const PORT = process.env.PORT || 3000;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("Defina SUPABASE_URL e SUPABASE_KEY no .env (veja .env.example).");
  process.exit(1);
}

// Um cliente por requisicao, com o token de quem esta logado:
// assim o RLS do banco garante que cada pessoa so grava em nome proprio.
function clienteDoUsuario(token) {
  return createClient(SUPABASE_URL, SUPABASE_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function lerToken(req) {
  const cabecalho = req.get("Authorization") || "";
  const [tipo, token] = cabecalho.split(" ");
  return tipo === "Bearer" && token ? token : null;
}

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

function textoPreenchido(texto) {
  return typeof texto === "string" && texto.trim() !== "";
}

app.post("/lancamentos", async (req, res) => {
  const token = lerToken(req);
  if (!token) {
    return res.status(401).json({ erro: "nao_autenticado" });
  }

  const corpo = req.body || {};
  const valor = converterValor(corpo.valor);
  const campos = [];

  if (!Number.isInteger(corpo.conta_id) || corpo.conta_id <= 0) {
    campos.push("conta_id");
  }
  if (!textoPreenchido(corpo.categoria_codigo)) campos.push("categoria_codigo");
  if (corpo.tipo !== "entrada" && corpo.tipo !== "saida") campos.push("tipo");
  if (!Number.isFinite(valor) || valor <= 0) campos.push("valor");
  if (!dataValida(corpo.data_lancamento)) campos.push("data_lancamento");
  if (!textoPreenchido(corpo.descricao)) campos.push("descricao");

  if (campos.length > 0) {
    return res.status(400).json({ erro: "campos_invalidos", campos });
  }

  try {
    const supabase = clienteDoUsuario(token);

    // O dono do lancamento sai do token, nunca do corpo da requisicao.
    const { data: sessao, error: erroSessao } = await supabase.auth.getUser(token);
    if (erroSessao || !sessao.user) {
      if (!erroSessao || isAuthApiError(erroSessao)) {
        return res.status(401).json({ erro: "nao_autenticado" });
      }
      return res.status(500).json({ erro: erroSessao.message });
    }

    const { data: criado, error } = await supabase
      .from("lancamentos")
      .insert({
        user_id: sessao.user.id,
        conta_id: corpo.conta_id,
        categoria_codigo: corpo.categoria_codigo.trim(),
        tipo: corpo.tipo,
        valor: Math.round(valor * 100) / 100,
        data: corpo.data_lancamento,
        descricao: corpo.descricao.trim(),
      })
      .select("id")
      .single();

    if (error) {
      console.error(error);
      return res.status(500).json({ erro: error.message });
    }

    res.status(201).json({ criado: true, lancamento_id: criado.id });
  } catch (falha) {
    console.error(falha);
    res.status(500).json({ erro: falha.message || "erro_interno" });
  }
});

// JSON malformado no corpo: responde em JSON em vez da pagina HTML padrao
app.use((err, req, res, next) => {
  if (err.type === "entity.parse.failed") {
    return res.status(400).json({ erro: "json_invalido" });
  }
  res.status(500).json({ erro: "erro_interno" });
});

app.listen(PORT, () => {
  console.log(`financas-familia ouvindo na porta ${PORT}`);
});
