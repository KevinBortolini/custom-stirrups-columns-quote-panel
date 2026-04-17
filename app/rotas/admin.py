from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel, Field
from app.configuracoes import carregar_precos, salvar_precos, token_admin_valido

router = APIRouter()


class LoginAdminEntrada(BaseModel):
    token: str


class PrecosEntrada(BaseModel):
    valor_kg_ferro_estribo_retangular: float = Field(..., gt=0)
    valor_kg_ferro_estribo_redondo: float = Field(..., gt=0)
    valor_kg_ferro_coluna_ret: float = Field(..., gt=0)
    valor_kg_ferro_coluna_red: float = Field(..., gt=0)


@router.post("/login")
def login_admin(dados: LoginAdminEntrada):
    if not token_admin_valido(dados.token):
        raise HTTPException(status_code=401, detail="Invalid admin token.")
    return {"ok": True}


@router.get("/precos")
def obter_precos(x_admin_token: str | None = Header(default=None)):
    if not token_admin_valido(x_admin_token):
        raise HTTPException(status_code=401, detail="Invalid admin token.")
    return carregar_precos()


@router.put("/precos")
def atualizar_precos(dados: PrecosEntrada, x_admin_token: str | None = Header(default=None)):
    if not token_admin_valido(x_admin_token):
        raise HTTPException(status_code=401, detail="Invalid admin token.")

    novos_precos = {
        "valor_kg_ferro_estribo_retangular": dados.valor_kg_ferro_estribo_retangular,
        "valor_kg_ferro_estribo_redondo": dados.valor_kg_ferro_estribo_redondo,
        "valor_kg_ferro_coluna_ret": dados.valor_kg_ferro_coluna_ret,
        "valor_kg_ferro_coluna_red": dados.valor_kg_ferro_coluna_red,
    }
    salvar_precos(novos_precos)
    return {"ok": True, "precos": novos_precos}