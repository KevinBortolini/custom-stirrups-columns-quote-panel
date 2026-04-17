from pathlib import Path
import json
import os

TOKEN_ADMIN = os.getenv("BUDGET_PANEL_ADMIN_TOKEN", "demo-admin-token")

ARQUIVO_PRECOS = Path(__file__).resolve().parent.parent / "precos.json"
ARQUIVO_DB = Path(__file__).resolve().parent.parent / "orcamentos.sqlite3"

PRECOS_PADRAO = {
    "valor_kg_ferro_estribo_retangular": 6.15,
    "valor_kg_ferro_estribo_redondo": 6.45,
    "valor_kg_ferro_coluna_ret": 6.20,
    "valor_kg_ferro_coluna_red": 6.50,
}


def token_admin_valido(token: str | None) -> bool:
    return bool(token) and token == TOKEN_ADMIN


def carregar_precos() -> dict:
    if not ARQUIVO_PRECOS.exists():
        try:
            salvar_precos(PRECOS_PADRAO)
        except OSError:
            return PRECOS_PADRAO.copy()
        return PRECOS_PADRAO.copy()

    try:
        with open(ARQUIVO_PRECOS, "r", encoding="utf-8") as f:
            dados = json.load(f)
    except (OSError, json.JSONDecodeError):
        return PRECOS_PADRAO.copy()

    if not isinstance(dados, dict):
        return PRECOS_PADRAO.copy()

    return {**PRECOS_PADRAO, **dados}


def salvar_precos(precos: dict) -> None:
    with open(ARQUIVO_PRECOS, "w", encoding="utf-8") as f:
        json.dump(precos, f, ensure_ascii=False, indent=2)
