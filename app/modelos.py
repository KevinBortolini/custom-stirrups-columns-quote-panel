from pydantic import BaseModel, Field
from typing import Any, List, Literal, Optional


FormatoEstribo = Literal["retangular", "redondo"]
BitolaEstribo = Literal[4.2, 5.0, 6.3]
TipoCliente = Literal["consumidor", "revenda"]


class EstriboEntrada(BaseModel):
    formato: FormatoEstribo = Field(..., description="retangular ou redondo")
    bitola_mm: BitolaEstribo = Field(..., description="4.2 ou 5.0")

    # Só para retangular
    largura_cm: Optional[int] = Field(default=None, ge=1, description="Somente retangular")
    comprimento_cm: Optional[int] = Field(default=None, ge=1, description="Somente retangular")

    # Só para redondo
    diametro_cm: Optional[int] = Field(default=None, ge=1, description="Somente redondo")

    quantidade: int = Field(..., ge=1, description="Quantidade")


class CalculoEstribosEntrada(BaseModel):
    valor_kg_ferro_estribo_retangular: Optional[float] = Field(default=None, gt=0, description="R$/kg (retangular)")
    valor_kg_ferro_estribo_redondo: Optional[float] = Field(default=None, gt=0, description="R$/kg (redondo)")
    estribos: List[EstriboEntrada] = Field(..., min_length=1, description="Lista de estribos")
    tipo_cliente: TipoCliente = "consumidor"
    desconto_percent: float = Field(default=0.0, ge=0.0, le=20.0, description="Desconto percentual (0 a 20)")

class LinhaTabelaEstribo(BaseModel):
    item: int
    descricao: str
    quantidade: int
    valor_unitario: str
    valor_total: str
    icms_st: str | None = None

    # Extras úteis (pra conferir e futuramente somar total geral)
    peso_unit_kg: Optional[float] = None
    peso_total_kg: Optional[float] = None


class CalculoEstribosSaida(BaseModel):
    tabela: List[LinhaTabelaEstribo]
    total_geral: str
    peso_total_geral_kg: Optional[float] = None

from typing import List, Literal, Optional

FormatoColuna = Literal["retangular", "redonda"]
BitolaFerroColuna = Literal[6, 8, 10, 12]
BitolaEstribo = Literal[4.2, 5.0, 6.3]


class ColunaEntrada(BaseModel):
    formato_coluna: FormatoColuna
    bitola_ferro_mm: BitolaFerroColuna
    bitola_estribo_mm: BitolaEstribo

    # Retangular
    quantidade_ferro_ret: Optional[int] = Field(default=4, ge=1, description="Somente retangular (padrão 4)")
    largura_coluna_cm: Optional[int] = Field(default=None, ge=1, description="Somente retangular")
    comprimento_coluna_cm: Optional[int] = Field(default=None, ge=1, description="Somente retangular")

    # Redonda
    quantidade_ferro_red: Optional[int] = Field(default=None, ge=1, description="Somente redonda")
    diametro_coluna_cm: Optional[int] = Field(default=None, ge=1, description="Somente redonda")

    quantidade_coluna: int = Field(..., ge=1)
    espacamento_estribo_cm: int = Field(default=23, ge=1)


class CalculoColunasEntrada(BaseModel):
    valor_kg_ferro_coluna_ret: Optional[float] = Field(default=None, gt=0, description="R$/kg (retangular)")
    valor_kg_ferro_coluna_red: Optional[float] = Field(default=None, gt=0, description="R$/kg (redonda)")
    colunas: List[ColunaEntrada] = Field(..., min_length=1)
    tipo_cliente: TipoCliente = "consumidor"
    desconto_percent: float = Field(default=0.0, ge=0.0, le=20.0, description="Desconto percentual (0 a 20)")

class LinhaTabelaColuna(BaseModel):
    item: int
    descricao: str
    quantidade: int
    valor_unitario: str
    valor_total: str
    icms_st: str | None = None

    # Só aparece se admin=true
    peso_unit_kg: Optional[float] = None
    peso_total_kg: Optional[float] = None
    qtd_estribos: Optional[int] = None
    icms_st: Optional[str] = None

class CalculoColunasSaida(BaseModel):
    tabela: List[LinhaTabelaColuna]
    total_geral: str
    peso_total_geral_kg: Optional[float] = None

class ClienteDados(BaseModel):
    tipo_cliente: TipoCliente = "consumidor"
    cliente_nome: str = ""
    cliente_telefone: str = ""
    cliente_email: str = ""
    endereco_entrega: str = ""
    vendedor_nome: str = ""
    data_orcamento: str = ""  # "YYYY-MM-DD"
    observacoes: str = ""
    desconto_percent: float = Field(default=0.0, ge=0.0, le=20.0)

class OrcamentoSalvarEntrada(BaseModel):
    cliente: ClienteDados
    estribos: List[EstriboEntrada] = Field(default_factory=list)
    colunas: List[ColunaEntrada] = Field(default_factory=list)

class OrcamentoSalvarSaida(BaseModel):
    numero_orcamento: int
    criado_em: str
    total_geral: str


class OrcamentoResumoSaida(BaseModel):
    numero_orcamento: int
    criado_em: str
    cliente_nome: str = ""
    vendedor_nome: str = ""
    data_orcamento: str = ""
    total_geral: str = ""


class OrcamentoDetalheSaida(BaseModel):
    numero_orcamento: int
    criado_em: str
    cliente_nome: str = ""
    vendedor_nome: str = ""
    data_orcamento: str = ""
    total_geral: str = ""
    payload: dict[str, Any]
