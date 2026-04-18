from fastapi import FastAPI
from app.rotas.sistema import router as router_sistema
from app.rotas.calculos import router as router_calculos
from app.rotas.admin import router as router_admin
from app.rotas.orcamentos import router as router_orcamentos

app = FastAPI(
    title="Custom Stirrups Columns Quote Panel",
    version="0.1.0",
    description="Internal-style web API for quote calculation, persistence, history, and PDF generation."
)

app.include_router(router_sistema, prefix="/sistema", tags=["sistema"])
app.include_router(router_calculos, prefix="/calculos", tags=["calculos"])
app.include_router(router_admin, prefix="/admin", tags=["admin"])
app.include_router(router_orcamentos, prefix="/orcamentos", tags=["orcamentos"])
