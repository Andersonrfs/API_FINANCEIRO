# API financas-familia — especificação

Serviço HTTP em Node.js + Express. Grava no mesmo banco Supabase do app Next.js.

## Configuração

Variáveis de ambiente, lidas do arquivo `.env` (modelo em `.env.example`):

| Variável | Obrigatória | O que é |
|---|---|---|
| `SUPABASE_URL` | sim | URL do projeto Supabase |
| `SUPABASE_KEY` | sim | Chave **secreta** `service_role`. Ela ignora o RLS, por isso fica só no servidor da API, nunca no app ou no celular. Com a chave pública, o servidor sobe com um aviso e todo POST devolve 500. |
| `PORT` | não | Porta do servidor. Sem ela, 3000. |

Sem `SUPABASE_URL` ou `SUPABASE_KEY`, o servidor não sobe e avisa no console.

## GET /health

- **200** `{ "servico": "financas-familia", "versao": "1.0.0" }`

## GET /status

- **200** `{ "nome": "financas-familia", "versao": "1.0.0", "hora": "<agora>" }`
- `hora` é a hora do servidor em ISO 8601, UTC. Exemplo: `"2026-11-24T23:40:12.345Z"`.

## POST /lancamentos

### Sem autenticação

A rota não pede login. O dono do lançamento é o `usuario_id` enviado no corpo, e a API confia nele.

**Atenção:** qualquer pessoa que alcance a API pode gravar em nome de qualquer usuário. Rode a API só numa rede fechada, ou volte a exigir login antes de expô-la na internet.

### Entrada

Corpo JSON (`Content-Type: application/json`):

```json
{
  "usuario_id": "00000000-0000-4000-8000-000000000001",
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
| `usuario_id` | UUID da pessoa (o `id` em `auth.users`, o mesmo `user_id` de `perfis`). Um número como `1` é recusado. | `user_id` |
| `conta_id` | Inteiro maior que zero. A conta precisa ser do `usuario_id`. | `conta_id` |
| `categoria_codigo` ou `categoria_id` | Um dos dois. `categoria_codigo` é texto, como `"01"`. `categoria_id` é o `id` antigo da categoria, um inteiro maior que zero, e a API busca o código correspondente. Se vierem os dois, vale o `categoria_codigo`. A categoria precisa ser do `usuario_id`. Se o `id` antigo já tiver sido apagado do banco (script `04`), o `categoria_id` é recusado com uma `dica`. | `categoria_codigo` |
| `tipo` | `"entrada"` ou `"saida"` | `tipo` |
| `valor` | Número maior que zero, ou texto como `"1250.80"`, `"1250,80"` ou `"1.250,80"`. Gravado com 2 casas. | `valor` |
| `data_lancamento` | Texto `AAAA-MM-DD` com data que existe no calendário | `data` |
| `descricao` | Texto com pelo menos um caractere que não seja espaço. Gravado sem os espaços das pontas. | `descricao` |

O lançamento entra com `situacao = 'confirmado'`, o padrão da tabela.

### Saída

| Situação | Resposta |
|---|---|
| Gravado | **201** `{ "criado": true, "lancamento_id": 4242 }`, com o `id` gerado pelo banco |
| Um ou mais campos errados | **400** `{ "erro": "campos_invalidos", "campos": [...] }`, listando todos, na ordem da tabela acima |
| Conta ou categoria inexistente ou de outra pessoa (ou `usuario_id` que não existe) | **400** `{ "erro": "campos_invalidos", "campos": ["conta_id", "categoria_codigo"] }`, só com os que falharam |
| `tipo` diferente do tipo da categoria | **400** `{ "erro": "tipo_diferente_da_categoria", "tipo_da_categoria": "entrada" }` |
| Corpo que não é JSON válido | **400** `{ "erro": "json_invalido" }` |
| O Supabase devolveu erro ou não respondeu | **500** `{ "erro": "<mensagem do Supabase>" }`. Nada foi gravado. |

### Ordem das verificações

1. Formato dos campos (400 `campos_invalidos`).
2. Conta e categoria do `usuario_id` (400 `campos_invalidos`). São as mesmas regras do app Next.js.
3. Tipo do lançamento igual ao tipo da categoria (400 `tipo_diferente_da_categoria`).
4. Insert.
