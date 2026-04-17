import json
import sqlite3
from datetime import datetime
from fastapi import APIRouter, Header, HTTPException, Query

from app.configuracoes import ARQUIVO_DB, token_admin_valido
from app.modelos import (
    OrcamentoSalvarEntrada,
    OrcamentoSalvarSaida,
    OrcamentoResumoSaida,
    OrcamentoDetalheSaida,
    CalculoEstribosEntrada,
    CalculoColunasEntrada,
)
from app.rotas.calculos import calcular_estribos, calcular_colunas


router = APIRouter()


def _conectar():
    conn = sqlite3.connect(str(ARQUIVO_DB))
    conn.row_factory = sqlite3.Row
    return conn


def _init_db():
    conn = _conectar()
    try:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS orcamentos (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              criado_em TEXT NOT NULL,
              payload_json TEXT NOT NULL,
              total_geral TEXT NOT NULL
            )
            """
        )
        colunas = {row["name"] for row in conn.execute("PRAGMA table_info(orcamentos)")}
        if "cliente_nome" not in colunas:
            conn.execute("ALTER TABLE orcamentos ADD COLUMN cliente_nome TEXT NOT NULL DEFAULT ''")
        if "data_orcamento" not in colunas:
            conn.execute("ALTER TABLE orcamentos ADD COLUMN data_orcamento TEXT NOT NULL DEFAULT ''")
        if "vendedor_nome" not in colunas:
            conn.execute("ALTER TABLE orcamentos ADD COLUMN vendedor_nome TEXT NOT NULL DEFAULT ''")
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_orcamentos_cliente_nome ON orcamentos(cliente_nome)"
        )
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_orcamentos_data_orcamento ON orcamentos(data_orcamento)"
        )
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_orcamentos_criado_em ON orcamentos(criado_em)"
        )
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_orcamentos_vendedor_nome ON orcamentos(vendedor_nome)"
        )
        _backfill_metadados(conn)
        conn.commit()
    finally:
        conn.close()


def _backfill_metadados(conn: sqlite3.Connection) -> None:
    rows = conn.execute(
        """
        SELECT id, payload_json
        FROM orcamentos
        WHERE cliente_nome = '' OR data_orcamento = '' OR vendedor_nome = ''
        """
    ).fetchall()
    for row in rows:
        payload = _carregar_payload(row["payload_json"])
        cliente = payload.get("cliente", {})
        conn.execute(
            """
            UPDATE orcamentos
            SET cliente_nome = ?, data_orcamento = ?, vendedor_nome = ?
            WHERE id = ?
            """,
            (
                cliente.get("cliente_nome", "") or "",
                cliente.get("data_orcamento", "") or "",
                cliente.get("vendedor_nome", "") or "",
                row["id"],
            ),
        )


def _carregar_payload(payload_json: str) -> dict:
    try:
        return json.loads(payload_json)
    except json.JSONDecodeError:
        return {}


def _resumo_orcamento_row(row: sqlite3.Row) -> OrcamentoResumoSaida:
    return OrcamentoResumoSaida(
        numero_orcamento=int(row["id"]),
        criado_em=row["criado_em"],
        cliente_nome=row["cliente_nome"] or "",
        vendedor_nome=row["vendedor_nome"] or "",
        data_orcamento=row["data_orcamento"] or "",
        total_geral=row["total_geral"] or "",
    )


@router.post("", response_model=OrcamentoSalvarSaida)
def salvar_orcamento(dados: OrcamentoSalvarEntrada):
    _init_db()

    if (not dados.estribos) and (not dados.colunas):
        raise HTTPException(status_code=422, detail="Add at least 1 item (stirrups or columns).")

    # 1) calcular automaticamente (sua opção A)
    resE = None
    resC = None

    if dados.estribos:
        entrada_e = CalculoEstribosEntrada(
            estribos=dados.estribos,
            tipo_cliente=dados.cliente.tipo_cliente,
            desconto_percent=dados.cliente.desconto_percent,
        )
        resE = calcular_estribos(entrada_e, admin=False, x_admin_token=None)

    if dados.colunas:
        entrada_c = CalculoColunasEntrada(
            colunas=dados.colunas,
            tipo_cliente=dados.cliente.tipo_cliente,
            desconto_percent=dados.cliente.desconto_percent,
        )
        resC = calcular_colunas(entrada_c, admin=False, x_admin_token=None)

    # total geral = soma dos subtotais (strings BRL)
    def parse_brl(s: str) -> float:
        t = s.replace("R$", "").strip().replace(".", "").replace(",", ".")
        try:
            return float(t)
        except:
            return 0.0

    total = 0.0
    if resE:
        total += parse_brl(resE.total_geral)
    if resC:
        total += parse_brl(resC.total_geral)

    # format BRL with thousands and 2 decimals
    inteiro, dec = f"{total:.2f}".split(".")
    inteiro = f"{int(inteiro):,}".replace(",", ".")
    total_fmt = f"R$ {inteiro},{dec}"

    payload = {
        "cliente": dados.cliente.model_dump(),
        "estribos": [e.model_dump() for e in dados.estribos],
        "colunas": [c.model_dump() for c in dados.colunas],
        "resultado_estribos": resE.model_dump() if resE else None,
        "resultado_colunas": resC.model_dump() if resC else None,
        "total_geral": total_fmt,
    }

    criado_em = datetime.now().isoformat(timespec="seconds")

    # 2) salvar e gerar numero automático
    conn = _conectar()
    try:
        cur = conn.execute(
            """
            INSERT INTO orcamentos (
                criado_em, payload_json, total_geral, cliente_nome, data_orcamento, vendedor_nome
            ) VALUES (?, ?, ?, ?, ?, ?)
            """,
            (
                criado_em,
                json.dumps(payload, ensure_ascii=False),
                total_fmt,
                dados.cliente.cliente_nome,
                dados.cliente.data_orcamento,
                dados.cliente.vendedor_nome,
            ),
        )
        conn.commit()
        numero = int(cur.lastrowid)
    finally:
        conn.close()

    return OrcamentoSalvarSaida(numero_orcamento=numero, criado_em=criado_em, total_geral=total_fmt)


@router.get("", response_model=list[OrcamentoResumoSaida])
def listar_orcamentos(
    numero: int | None = Query(default=None),
    cliente: str | None = Query(default=None),
    vendedor: str | None = Query(default=None),
    data: str | None = Query(default=None),
    data_inicial: str | None = Query(default=None),
    data_final: str | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
):
    _init_db()

    filtros = []
    params = []

    if numero is not None:
        filtros.append("id = ?")
        params.append(numero)

    if cliente:
        filtros.append("cliente_nome LIKE ?")
        params.append(f"%{cliente.strip()}%")

    if vendedor:
        filtros.append("vendedor_nome LIKE ?")
        params.append(f"%{vendedor.strip()}%")

    if data:
        filtros.append("data_orcamento = ?")
        params.append(data)

    if data_inicial:
        filtros.append("data_orcamento >= ?")
        params.append(data_inicial)

    if data_final:
        filtros.append("data_orcamento <= ?")
        params.append(data_final)

    where = f"WHERE {' AND '.join(filtros)}" if filtros else ""
    params.append(limit)

    conn = _conectar()
    try:
        rows = conn.execute(
            f"""
            SELECT id, criado_em, cliente_nome, vendedor_nome, data_orcamento, total_geral
            FROM orcamentos
            {where}
            ORDER BY id DESC
            LIMIT ?
            """,
            params,
        ).fetchall()
    finally:
        conn.close()

    return [_resumo_orcamento_row(row) for row in rows]


@router.get("/{numero_orcamento}", response_model=OrcamentoDetalheSaida)
def obter_orcamento(numero_orcamento: int):
    _init_db()

    conn = _conectar()
    try:
        row = conn.execute(
            """
            SELECT id, criado_em, payload_json, total_geral, cliente_nome, vendedor_nome, data_orcamento
            FROM orcamentos
            WHERE id = ?
            """,
            (numero_orcamento,),
        ).fetchone()
    finally:
        conn.close()

    if row is None:
        raise HTTPException(status_code=404, detail="Quote not found.")

    return OrcamentoDetalheSaida(
        numero_orcamento=int(row["id"]),
        criado_em=row["criado_em"],
        cliente_nome=row["cliente_nome"] or "",
        vendedor_nome=row["vendedor_nome"] or "",
        data_orcamento=row["data_orcamento"] or "",
        total_geral=row["total_geral"] or "",
        payload=_carregar_payload(row["payload_json"]),
    )


@router.delete("/{numero_orcamento}")
def excluir_orcamento(numero_orcamento: int, x_admin_token: str | None = Header(default=None)):
    _init_db()

    if not token_admin_valido(x_admin_token):
        raise HTTPException(status_code=401, detail="Invalid admin token.")

    conn = _conectar()
    try:
        cur = conn.execute("DELETE FROM orcamentos WHERE id = ?", (numero_orcamento,))
        conn.commit()
    finally:
        conn.close()

    if cur.rowcount == 0:
        raise HTTPException(status_code=404, detail="Quote not found.")

    return {"ok": True, "numero_orcamento": numero_orcamento}
