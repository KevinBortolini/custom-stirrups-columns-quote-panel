from fastapi import APIRouter

router = APIRouter()

@router.get("/health")
def health():
    return {"status": "ok"}

@router.get("/versao")
def versao():
    return {"nome": "Custom Stirrups Columns Quote Panel", "versao": "0.1.0"}
