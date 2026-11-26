const path = require("path");
require("dotenv").config({ path: path.join(__dirname, ".env"), quiet: true });

const express = require("express");
const { createClient } = require("@supabase/supabase-js");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const PORT = process.env.PORT || 3000;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("Defina SUPABASE_URL e SUPABASE_KEY no .env (veja .env.example).");
  process.exit(1);
}

// Sem login, a API precisa da chave secreta (service_role), que ignora o RLS.
// Com a chave publica, o banco recusa todo insert.
if (SUPABASE_KEY.startsWith("sb_publishable_")) {
  console.warn(
    "Aviso: SUPABASE_KEY e a chave publica. Sem login, os inserts vao falhar. " +
      "Use a chave secreta (service_role) no .env."
  );
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
  const corpo = req.body || {};
  const valor = converterValor(corpo.valor);
  const campos = [];

  // Sem login, o dono do lancamento vem no corpo: o UUID da pessoa (auth.users).
  // Tira espacos e caracteres invisiveis que costumam vir junto ao copiar e colar.
  const usuarioId =
    typeof corpo.usuario_id === "string"
      ? corpo.usuario_id.replace(/[\u200B-\u200D\uFEFF]/g, "").trim().toLowerCase()
      : "";
  if (!UUID.test(usuarioId)) campos.push("usuario_id");
  if (!Number.isInteger(corpo.conta_id) || corpo.conta_id <= 0) {
    campos.push("conta_id");
  }
  // A categoria pode vir pelo codigo (como o app usa) ou pelo id antigo.
  // Se vierem os dois, vale o codigo.
  const categoriaId =
    typeof corpo.categoria_id === "string" && /^\d+$/.test(corpo.categoria_id.trim())
      ? Number(corpo.categoria_id.trim())
      : corpo.categoria_id;
  const porCodigo = textoPreenchido(corpo.categoria_codigo);
  const porId = !porCodigo && Number.isInteger(categoriaId) && categoriaId > 0;
  if (!porCodigo && !porId) campos.push("categoria_codigo");
  if (corpo.tipo !== "entrada" && corpo.tipo !== "saida") campos.push("tipo");
  if (!Number.isFinite(valor) || valor <= 0) campos.push("valor");
  if (!dataValida(corpo.data_lancamento)) campos.push("data_lancamento");
  if (!textoPreenchido(corpo.descricao)) campos.push("descricao");

  if (campos.length > 0) {
    return res.status(400).json({ erro: "campos_invalidos", campos });
  }

  try {
    // Mesmas verificacoes do app: a conta e a categoria precisam ser da pessoa
    // do usuario_id, e o tipo do lancamento precisa ser o tipo da categoria.
    // A chave service_role ignora o RLS, entao o filtro por user_id e obrigatorio.
    const buscaCategoria = supabase
      .from("categorias")
      .select("codigo, tipo")
      .eq("user_id", usuarioId);
    const [conta, categoria] = await Promise.all([
      supabase
        .from("contas")
        .select("id")
        .eq("id", corpo.conta_id)
        .eq("user_id", usuarioId)
        .maybeSingle(),
      porCodigo
        ? buscaCategoria.eq("codigo", corpo.categoria_codigo.trim()).maybeSingle()
        : buscaCategoria.eq("id", categoriaId).maybeSingle(),
    ]);

    // 42703: a coluna categorias.id (obsoleta) foi apagada pelo script 04.
    if (porId && categoria.error && categoria.error.code === "42703") {
      return res.status(400).json({
        erro: "campos_invalidos",
        campos: ["categoria_codigo"],
        dica: 'categoria_id nao existe mais no banco. Envie categoria_codigo (ex.: "01").',
      });
    }

    if (conta.error || categoria.error) {
      const erroConsulta = conta.error || categoria.error;
      console.error(erroConsulta);
      return res.status(500).json({ erro: erroConsulta.message });
    }

    const camposDoDono = [];
    if (!conta.data) camposDoDono.push("conta_id");
    if (!categoria.data) camposDoDono.push(porId ? "categoria_id" : "categoria_codigo");
    if (camposDoDono.length > 0) {
      return res
        .status(400)
        .json({ erro: "campos_invalidos", campos: camposDoDono });
    }

    if (categoria.data.tipo !== corpo.tipo) {
      return res.status(400).json({
        erro: "tipo_diferente_da_categoria",
        tipo_da_categoria: categoria.data.tipo,
      });
    }

    const { data: criado, error } = await supabase
      .from("lancamentos")
      .insert({
        user_id: usuarioId,
        conta_id: corpo.conta_id,
        categoria_codigo: categoria.data.codigo,
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
