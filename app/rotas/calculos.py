import math

from fastapi import APIRouter, Header, HTTPException

from app.configuracoes import carregar_precos, token_admin_valido
from app.modelos import (
    CalculoColunasEntrada,
    CalculoColunasSaida,
    CalculoEstribosEntrada,
    CalculoEstribosSaida,
    LinhaTabelaColuna,
    LinhaTabelaEstribo,
)

router = APIRouter()

# Generic portfolio-safe factors for a believable demo model.
GAUGE_WEIGHT_FACTOR = {
    4.2: 0.14,
    5.0: 0.18,
    6.3: 0.24,
}

MAIN_BAR_WEIGHT_FACTOR = {
    6: 0.30,
    8: 0.38,
    10: 0.49,
    12: 0.62,
}

SHAPE_COMPLEXITY_FACTOR = {
    "retangular": 1.00,
    "redondo": 1.06,
    "redonda": 1.06,
}

RESELLER_SURCHARGE_PERCENT = 0.065
DEMO_COLUMN_HEIGHT_CM = 320
DEMO_COLUMN_MIN_STIRRUPS = 6


def _arredondar_para_cima(valor: float, casas: int) -> float:
    fator = 10 ** casas
    return math.ceil(valor * fator) / fator


def _formatar_brl_cima(valor: float) -> str:
    valor_arredondado = _arredondar_para_cima(valor, 2)
    parte_inteira, parte_decimal = f"{valor_arredondado:.2f}".split(".")
    parte_inteira_com_pontos = f"{int(parte_inteira):,}".replace(",", ".")
    return f"R$ {parte_inteira_com_pontos},{parte_decimal}"


def _aplicar_desconto(valor: float, desconto_percent: float) -> float:
    if desconto_percent <= 0:
        return valor
    return valor * (1.0 - (desconto_percent / 100.0))


def _bitola_ferro_texto(bitola_mm: int) -> str:
    mapa = {
        6: "6.3mm",
        8: "8mm",
        10: "10mm",
        12: "12.5mm",
    }
    return mapa.get(bitola_mm, f"{bitola_mm}mm")


def _gauge_factor(bitola_mm: float) -> float:
    try:
        return GAUGE_WEIGHT_FACTOR[bitola_mm]
    except KeyError as exc:
        raise ValueError("invalid stirrup gauge") from exc


def _main_bar_factor(bitola_mm: int) -> float:
    try:
        return MAIN_BAR_WEIGHT_FACTOR[bitola_mm]
    except KeyError as exc:
        raise ValueError("invalid main bar gauge") from exc


def _shape_factor(formato: str) -> float:
    return SHAPE_COMPLEXITY_FACTOR.get(formato, 1.0)


def _estimated_rectangular_stirrup_weight(largura_cm: int, comprimento_cm: int, bitola_mm: float) -> float:
    perimeter_cm = (largura_cm * 2) + (comprimento_cm * 2)
    geometry_factor = max(0.90, perimeter_cm / 42.0)
    return geometry_factor * _gauge_factor(bitola_mm) * _shape_factor("retangular")


def _estimated_round_stirrup_weight(diametro_cm: int, bitola_mm: float) -> float:
    circumference_cm = diametro_cm * math.pi
    geometry_factor = max(0.92, circumference_cm / 38.0)
    return geometry_factor * _gauge_factor(bitola_mm) * _shape_factor("redondo")


def _estimated_stirrups_per_column(espacamento_estribo_cm: int) -> int:
    return max(
        DEMO_COLUMN_MIN_STIRRUPS,
        int(math.ceil(DEMO_COLUMN_HEIGHT_CM / max(espacamento_estribo_cm, 1))) + 1,
    )


def _estimated_rectangular_column_weight(
    largura_cm: int,
    comprimento_cm: int,
    quantidade_ferro: int,
    bitola_ferro_mm: int,
    bitola_estribo_mm: float,
    espacamento_estribo_cm: int,
) -> tuple[float, int]:
    qtd_estribos = _estimated_stirrups_per_column(espacamento_estribo_cm)
    stirrup_weight = _estimated_rectangular_stirrup_weight(
        largura_cm, comprimento_cm, bitola_estribo_mm
    ) * qtd_estribos * 0.23
    main_bar_weight = quantidade_ferro * _main_bar_factor(bitola_ferro_mm) * 1.45
    dimension_factor = 1.0 + ((largura_cm + comprimento_cm) / 220.0)
    total_weight = (stirrup_weight + main_bar_weight) * dimension_factor
    return total_weight, qtd_estribos


def _estimated_round_column_weight(
    diametro_cm: int,
    quantidade_ferro: int,
    bitola_ferro_mm: int,
    bitola_estribo_mm: float,
    espacamento_estribo_cm: int,
) -> tuple[float, int]:
    qtd_estribos = _estimated_stirrups_per_column(espacamento_estribo_cm)
    stirrup_weight = _estimated_round_stirrup_weight(diametro_cm, bitola_estribo_mm) * qtd_estribos * 0.24
    main_bar_weight = quantidade_ferro * _main_bar_factor(bitola_ferro_mm) * 1.52
    dimension_factor = 1.02 + (diametro_cm / 115.0)
    total_weight = (stirrup_weight + main_bar_weight) * dimension_factor
    return total_weight, qtd_estribos


@router.post("/estribos", response_model=CalculoEstribosSaida, response_model_exclude_none=True)
def calcular_estribos(
    dados: CalculoEstribosEntrada,
    admin: bool = False,
    x_admin_token: str | None = Header(default=None),
):
    admin_autorizado = token_admin_valido(x_admin_token)

    if admin and not admin_autorizado:
        raise HTTPException(status_code=401, detail="Invalid admin token.")

    precos = carregar_precos()
    tabela = []
    total_geral = 0.0
    peso_total_geral = 0.0

    for idx, e in enumerate(dados.estribos, start=1):
        if e.formato == "retangular":
            if e.largura_cm is None or e.comprimento_cm is None:
                raise HTTPException(
                    status_code=422,
                    detail=f"Stirrup item {idx}: rectangular format requires largura_cm and comprimento_cm.",
                )
            if e.diametro_cm is not None:
                raise HTTPException(
                    status_code=422,
                    detail=f"Stirrup item {idx}: rectangular format cannot use diametro_cm.",
                )
            peso_unit_kg = _estimated_rectangular_stirrup_weight(
                e.largura_cm, e.comprimento_cm, e.bitola_mm
            )
            valor_kg = precos["valor_kg_ferro_estribo_retangular"]
            descricao = f"Stirrup Rectangular {e.bitola_mm}mm - {e.largura_cm}x{e.comprimento_cm}cm"
        elif e.formato == "redondo":
            if e.diametro_cm is None:
                raise HTTPException(
                    status_code=422,
                    detail=f"Stirrup item {idx}: round format requires diametro_cm.",
                )
            if e.largura_cm is not None or e.comprimento_cm is not None:
                raise HTTPException(
                    status_code=422,
                    detail=f"Stirrup item {idx}: round format cannot use largura_cm/comprimento_cm.",
                )
            peso_unit_kg = _estimated_round_stirrup_weight(e.diametro_cm, e.bitola_mm)
            valor_kg = precos["valor_kg_ferro_estribo_redondo"]
            descricao = f"Stirrup Round {e.bitola_mm}mm - Ø {e.diametro_cm}cm"
        else:
            raise HTTPException(status_code=422, detail=f"Stirrup item {idx}: invalid format.")

        valor_unit = _aplicar_desconto(valor_kg * peso_unit_kg, dados.desconto_percent)
        surcharge_unit = valor_unit * RESELLER_SURCHARGE_PERCENT if dados.tipo_cliente == "revenda" else 0.0
        valor_total = e.quantidade * (valor_unit + surcharge_unit)
        peso_total = e.quantidade * peso_unit_kg

        tabela.append(
            LinhaTabelaEstribo(
                item=idx,
                descricao=descricao,
                quantidade=e.quantidade,
                valor_unitario=_formatar_brl_cima(valor_unit),
                icms_st=_formatar_brl_cima(surcharge_unit) if dados.tipo_cliente == "revenda" else None,
                valor_total=_formatar_brl_cima(valor_total),
                peso_unit_kg=_arredondar_para_cima(peso_unit_kg, 3) if admin_autorizado else None,
                peso_total_kg=_arredondar_para_cima(peso_total, 3) if admin_autorizado else None,
            )
        )

        total_geral += valor_total
        peso_total_geral += peso_total

    return CalculoEstribosSaida(
        tabela=tabela,
        total_geral=_formatar_brl_cima(total_geral),
        peso_total_geral_kg=_arredondar_para_cima(peso_total_geral, 3) if admin_autorizado else None,
    )


@router.post("/colunas", response_model=CalculoColunasSaida, response_model_exclude_none=True)
def calcular_colunas(
    dados: CalculoColunasEntrada,
    admin: bool = False,
    x_admin_token: str | None = Header(default=None),
):
    admin_autorizado = token_admin_valido(x_admin_token)

    if admin and not admin_autorizado:
        raise HTTPException(status_code=401, detail="Invalid admin token.")

    precos = carregar_precos()
    tabela = []
    total_geral = 0.0
    peso_total_geral = 0.0

    for idx, c in enumerate(dados.colunas, start=1):
        if c.formato_coluna == "retangular":
            if c.largura_coluna_cm is None or c.comprimento_coluna_cm is None:
                raise HTTPException(
                    status_code=422,
                    detail=f"Column item {idx}: rectangular format requires largura_coluna_cm and comprimento_coluna_cm.",
                )

            qtd_barras = c.quantidade_ferro_ret or 4
            peso_unit, qtd_estribos = _estimated_rectangular_column_weight(
                c.largura_coluna_cm,
                c.comprimento_coluna_cm,
                qtd_barras,
                c.bitola_ferro_mm,
                c.bitola_estribo_mm,
                c.espacamento_estribo_cm,
            )
            valor_kg = precos["valor_kg_ferro_coluna_ret"]
            descricao = (
                f"Column Rectangular: {qtd_barras} main bars {_bitola_ferro_texto(c.bitola_ferro_mm)} - "
                f"{c.largura_coluna_cm}x{c.comprimento_coluna_cm}cm {c.bitola_estribo_mm}mm"
            )
        elif c.formato_coluna == "redonda":
            if c.diametro_coluna_cm is None or c.quantidade_ferro_red is None:
                raise HTTPException(
                    status_code=422,
                    detail=f"Column item {idx}: round format requires diametro_coluna_cm and quantidade_ferro_red.",
                )

            qtd_barras = c.quantidade_ferro_red
            peso_unit, qtd_estribos = _estimated_round_column_weight(
                c.diametro_coluna_cm,
                qtd_barras,
                c.bitola_ferro_mm,
                c.bitola_estribo_mm,
                c.espacamento_estribo_cm,
            )
            valor_kg = precos["valor_kg_ferro_coluna_red"]
            descricao = (
                f"Column Round: {qtd_barras} main bars {_bitola_ferro_texto(c.bitola_ferro_mm)} - "
                f"Ø{c.diametro_coluna_cm}cm {c.bitola_estribo_mm}mm"
            )
        else:
            raise HTTPException(status_code=422, detail=f"Column item {idx}: invalid formato_coluna.")

        complexity_adjustment = 1.0 + (max(qtd_estribos - DEMO_COLUMN_MIN_STIRRUPS, 0) * 0.01)
        valor_unit = _aplicar_desconto((peso_unit * valor_kg) * complexity_adjustment, dados.desconto_percent)
        surcharge_unit = valor_unit * RESELLER_SURCHARGE_PERCENT if dados.tipo_cliente == "revenda" else 0.0
        valor_total = c.quantidade_coluna * (valor_unit + surcharge_unit)
        peso_total = c.quantidade_coluna * peso_unit

        tabela.append(
            LinhaTabelaColuna(
                item=idx,
                descricao=descricao,
                quantidade=c.quantidade_coluna,
                valor_unitario=_formatar_brl_cima(valor_unit),
                valor_total=_formatar_brl_cima(valor_total),
                icms_st=_formatar_brl_cima(surcharge_unit) if dados.tipo_cliente == "revenda" else None,
                peso_unit_kg=_arredondar_para_cima(peso_unit, 3) if admin_autorizado else None,
                peso_total_kg=_arredondar_para_cima(peso_total, 3) if admin_autorizado else None,
                qtd_estribos=qtd_estribos if admin_autorizado else None,
            )
        )

        total_geral += valor_total
        peso_total_geral += peso_total

    return CalculoColunasSaida(
        tabela=tabela,
        total_geral=_formatar_brl_cima(total_geral),
        peso_total_geral_kg=_arredondar_para_cima(peso_total_geral, 3) if admin_autorizado else None,
    )
