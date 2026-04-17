from fastapi import APIRouter

router = APIRouter()

@router.get("/health")
def health():
    return {"status": "ok"}

@router.get("/versao")
def versao():
    return {"nome": "Budget Panel for Custom Stirrups and Columns", "versao": "0.1.0"}
