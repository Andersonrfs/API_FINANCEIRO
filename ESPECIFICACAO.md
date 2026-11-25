# API financas-familia — especificação

Serviço HTTP em Node.js + Express, porta 3000. Nada é gravado em banco ainda.

## GET /health

Verificação simples para outros sistemas.

- **200** `{ "servico": "financas-familia", "versao": "1.0.0" }`

## GET /status

Para confirmar que o serviço está de pé e a que horas respondeu.

- **200** `{ "nome": "financas-familia", "versao": "1.0.0", "hora": "<agora>" }`
- `hora` é a hora do servidor no formato ISO 8601 em UTC, por exemplo `"2026-11-24T23:40:12.345Z"`.

## POST /lancamentos

### Entrada

Corpo JSON (`Content-Type: application/json`):

```json
{ "valor": "89,05", "descricao": "padaria", "data": "2026-11-24" }
```

| Campo | Obrigatório | Regra |
|---|---|---|
| `valor` | sim | Número maior que zero, ou texto com um desses formatos: `"89.05"`, `"89,05"`, `"1.234"`, `"1.234,56"`, `"1.234.567,89"`. Sem zero à esquerda (`"089"` é recusado). |
| `descricao` | sim | Texto com pelo menos um caractere que não seja espaço. |
| `data` | sim | Texto `AAAA-MM-DD` com uma data que existe no calendário (`"2026-02-30"` é recusado). |

### Saída

**201** quando os três campos são válidos:

```json
{ "criado": true, "valor": 89.05, "descricao": "padaria", "data": "2026-11-24" }
```

- `valor` sai sempre como número.
- `descricao` sai sem os espaços das pontas.

**400** quando um ou mais campos estão errados. A resposta lista todos os campos com problema, na ordem `valor`, `descricao`, `data`:

```json
{ "erro": "campos_invalidos", "campos": ["descricao"] }
```

### Regras de cada 400

| Situação | `campos` contém |
|---|---|
| `valor` ausente, zero, negativo ou em formato não aceito | `"valor"` |
| `descricao` ausente, vazia, só espaços ou que não é texto | `"descricao"` |
| `data` ausente, fora do formato `AAAA-MM-DD` ou inexistente | `"data"` |
| Corpo ausente ou vazio | `["valor", "descricao", "data"]` |

Corpo que não é JSON válido responde **400** `{ "erro": "json_invalido" }`.
