# API financas-familia — especificação

Serviço HTTP em Node.js + Express. Grava no mesmo banco Supabase do app Next.js.

## Configuração

Variáveis de ambiente, lidas do arquivo `.env` (modelo em `.env.example`):

| Variável | Obrigatória | O que é |
|---|---|---|
| `SUPABASE_URL` | sim | URL do projeto Supabase |
| `SUPABASE_KEY` | sim | Chave pública anon/publishable, a mesma do app. Nunca a `service_role`. |
| `PORT` | não | Porta do servidor. Sem ela, 3000. |

Sem `SUPABASE_URL` ou `SUPABASE_KEY`, o servidor não sobe e avisa no console.

## GET /health

- **200** `{ "servico": "financas-familia", "versao": "1.0.0" }`

## GET /status

- **200** `{ "nome": "financas-familia", "versao": "1.0.0", "hora": "<agora>" }`
- `hora` é a hora do servidor em ISO 8601, UTC. Exemplo: `"2026-11-24T23:40:12.345Z"`.

## POST /lancamentos

### Autenticação

Quem chama precisa estar logado no Supabase (o mesmo login do app) e mandar o token da sessão:

```
Authorization: Bearer <access_token>
```

O dono do lançamento é a pessoa do token. Um `usuario_id` no corpo é ignorado. O RLS do banco impede gravar em nome de outra pessoa.

### Entrada

Corpo JSON (`Content-Type: application/json`):

```json
{
  "conta_id": 1,
  "categoria_codigo": "01",
  "tipo": "saida",
  "valor": 1250.80,
  "data_lancamento": "2025-05-05",
  "descricao": "mercado do mes"
}
```

| Campo | Regra | Coluna no banco |
|---|---|---|
| `conta_id` | Inteiro maior que zero. A conta precisa ser de quem está logado. | `conta_id` |
| `categoria_codigo` | Texto não vazio, como `"01"`. A categoria precisa ser de quem está logado. | `categoria_codigo` |
| `tipo` | `"entrada"` ou `"saida"` | `tipo` |
| `valor` | Número maior que zero, ou texto como `"1250.80"`, `"1250,80"` ou `"1.250,80"`. Gravado com 2 casas. | `valor` |
| `data_lancamento` | Texto `AAAA-MM-DD` com data que existe no calendário | `data` |
| `descricao` | Texto com pelo menos um caractere que não seja espaço. Gravado sem os espaços das pontas. | `descricao` |

O lançamento entra com `situacao = 'confirmado'`, o padrão da tabela.

### Saída

| Situação | Resposta |
|---|---|
| Gravado | **201** `{ "criado": true, "lancamento_id": 4242 }`, com o `id` gerado pelo banco |
| Sem o cabeçalho `Authorization: Bearer`, ou token inválido ou vencido | **401** `{ "erro": "nao_autenticado" }` |
| Um ou mais campos errados | **400** `{ "erro": "campos_invalidos", "campos": [...] }`, listando todos, na ordem da tabela acima |
| Conta ou categoria inexistente ou de outra pessoa | **400** `{ "erro": "campos_invalidos", "campos": ["conta_id", "categoria_codigo"] }`, só com os que falharam |
| `tipo` diferente do tipo da categoria | **400** `{ "erro": "tipo_diferente_da_categoria", "tipo_da_categoria": "entrada" }` |
| Corpo que não é JSON válido | **400** `{ "erro": "json_invalido" }` |
| O Supabase devolveu erro ou não respondeu | **500** `{ "erro": "<mensagem do Supabase>" }`. Nada foi gravado. |

### Ordem das verificações

1. Token presente (senão 401).
2. Formato dos campos (400 `campos_invalidos`).
3. Token válido no Supabase (senão 401).
4. Conta e categoria do dono do token (400 `campos_invalidos`). São as mesmas regras do app Next.js.
5. Tipo do lançamento igual ao tipo da categoria (400 `tipo_diferente_da_categoria`).
6. Insert.
