import math
from fastapi import APIRouter, HTTPException
from app.modelos import (
    CalculoEstribosEntrada, CalculoEstribosSaida, LinhaTabelaEstribo
)
from fastapi import APIRouter, HTTPException, Header
from app.configuracoes import carregar_precos, token_admin_valido

router = APIRouter()

# Constantes (do seu spec)
MASSA_NOMINAL_4MM_KG_M = 0.109
MASSA_NOMINAL_5MM_KG_M = 0.154
MASSA_NOMINAL_6MM_KG_M = 0.245
E_RET_TRANSPASSE_MM = 50
E_RED_TRANSPASSE_MM = 160
PERDA_DOBRAS_MM = 25
ICMS_ST_PERCENTUAL = 0.081615


def _formatar_brl(valor: float) -> str:
    texto = f"{valor:.2f}".replace(".", ",")
    return f"R$ {texto}"

def _arredondar_para_cima(valor: float, casas: int) -> float:
    fator = 10 ** casas
    return math.ceil(valor * fator) / fator

def _formatar_brl_inteiro_cima(valor: float) -> str:
    valor_arredondado = math.ceil(valor)
    parte_inteira_com_pontos = f"{valor_arredondado:,}".replace(",", ".")
    return f"R$ {parte_inteira_com_pontos},00"

def _formatar_brl_cima(valor: float) -> str:
    valor_arredondado = _arredondar_para_cima(valor, 2)
    parte_inteira, parte_decimal = f"{valor_arredondado:.2f}".split(".")
    parte_inteira_com_pontos = f"{int(parte_inteira):,}".replace(",", ".")
    return f"R$ {parte_inteira_com_pontos},{parte_decimal}"

def _massa_por_metro(bitola_mm: float) -> float:
    if bitola_mm == 4.2:
        return MASSA_NOMINAL_4MM_KG_M
    if bitola_mm == 5.0:
        return MASSA_NOMINAL_5MM_KG_M
    if bitola_mm == 6.3:
        return MASSA_NOMINAL_6MM_KG_M
    raise ValueError("bitola_mm inválida")

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


@router.post("/estribos", response_model=CalculoEstribosSaida, response_model_exclude_none=True)
def calcular_estribos(
    dados: CalculoEstribosEntrada,
    admin: bool = False,
    x_admin_token: str | None = Header(default=None)
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
                    detail=f"Stirrup item {idx}: rectangular format requires largura_cm and comprimento_cm."
                )
            if e.diametro_cm is not None:
                raise HTTPException(
                    status_code=422,
                    detail=f"Stirrup item {idx}: rectangular format cannot use diametro_cm."
                )

            comprimento_total_mm = (
                e.largura_cm * 10 * 2
                + e.comprimento_cm * 10 * 2
                + E_RET_TRANSPASSE_MM * 2
                + PERDA_DOBRAS_MM
            )
            comprimento_total_m = comprimento_total_mm / 1000.0

            peso_unit_kg = comprimento_total_m * _massa_por_metro(e.bitola_mm)
            peso_total_kg = e.quantidade * peso_unit_kg

            valor_kg = precos["valor_kg_ferro_estribo_retangular"]
            valor_unit = valor_kg * peso_unit_kg
            valor_unit = _aplicar_desconto(valor_unit, dados.desconto_percent)
            valor_total = valor_kg * peso_total_kg

            formato_nome = e.formato.capitalize()
            descricao = f"Estribo {formato_nome} {e.bitola_mm}mm - {e.largura_cm}x{e.comprimento_cm}cm"

        elif e.formato == "redondo":
            if e.diametro_cm is None:
                raise HTTPException(
                    status_code=422,
                    detail=f"Stirrup item {idx}: round format requires diametro_cm."
                )
            if e.largura_cm is not None or e.comprimento_cm is not None:
                raise HTTPException(
                    status_code=422,
                    detail=f"Stirrup item {idx}: round format cannot use largura_cm/comprimento_cm."
                )

            comprimento_total_mm = (3.15 * e.diametro_cm * 10) + E_RED_TRANSPASSE_MM
            comprimento_total_m = comprimento_total_mm / 1000.0

            peso_unit_kg = comprimento_total_m * _massa_por_metro(e.bitola_mm)
            peso_total_kg = e.quantidade * peso_unit_kg

            valor_kg = precos["valor_kg_ferro_estribo_redondo"]
            valor_unit = valor_kg * peso_unit_kg
            valor_total = valor_kg * peso_total_kg

            formato_nome = e.formato.capitalize()
            descricao = f"Estribo {formato_nome} {e.bitola_mm}mm - Ø {e.diametro_cm}cm"

        else:
            raise HTTPException(status_code=422, detail=f"Stirrup item {idx}: invalid format.")

        icms_st_unit = 0.0
        if dados.tipo_cliente == "revenda":
            icms_st_unit = valor_unit * ICMS_ST_PERCENTUAL

        valor_total_exato = e.quantidade * (valor_unit + icms_st_unit)

        tabela.append(
            LinhaTabelaEstribo(
                item=idx,
                descricao=descricao,
                quantidade=e.quantidade,
                valor_unitario=_formatar_brl_cima(valor_unit),
                icms_st=_formatar_brl_cima(icms_st_unit) if dados.tipo_cliente == "revenda" else None,
                valor_total=_formatar_brl_cima(valor_total_exato),
                peso_unit_kg=_arredondar_para_cima(peso_unit_kg, 3) if admin_autorizado else None,
                peso_total_kg=_arredondar_para_cima(peso_total_kg, 3) if admin_autorizado else None,
            )
        )

        total_geral += valor_total_exato
        peso_total_geral += peso_total_kg

    return CalculoEstribosSaida(
        tabela=tabela,
        total_geral=_formatar_brl_cima(total_geral),
        peso_total_geral_kg=_arredondar_para_cima(peso_total_geral, 3) if admin_autorizado else None,
    )



from fastapi import HTTPException
from app.modelos import CalculoColunasEntrada, CalculoColunasSaida, LinhaTabelaColuna

# Constantes do seu rascunho :contentReference[oaicite:5]{index=5}
MASSA_NOMINAL_6MM_KG_M = 0.245
MASSA_NOMINAL_8MM_KG_M = 0.395
MASSA_NOMINAL_10MM_KG_M = 0.617
MASSA_NOMINAL_12MM_KG_M = 0.963

COMPRIMENTO_BARRA_M = 12

FATOR_BITOLA_6MM = 1.12

# Assumindo coluna de 6,0m (6000mm) como no rascunho :contentReference[oaicite:6]{index=6}
ALTURA_COLUNA_MM = 6000

def _massa_por_metro_ferro(bitola_ferro_mm: int) -> float:
    if bitola_ferro_mm == 6:
        return MASSA_NOMINAL_6MM_KG_M
    if bitola_ferro_mm == 8:
        return MASSA_NOMINAL_8MM_KG_M
    if bitola_ferro_mm == 10:
        return MASSA_NOMINAL_10MM_KG_M
    if bitola_ferro_mm == 12:
        return MASSA_NOMINAL_12MM_KG_M
    raise ValueError("bitola_ferro_mm inválida")

def _peso_barra_kg(bitola_ferro_mm: int) -> float:
    return _massa_por_metro_ferro(bitola_ferro_mm) * COMPRIMENTO_BARRA_M

def _qtd_estribos_por_coluna(espacamento_estribo_cm: int) -> int:
    # Seu rascunho mistura unidades: 6000 / espacamento_cm + 1 :contentReference[oaicite:7]{index=7}
    # Vou interpretar corretamente: 6000mm / (esp_cm*10) + 1 e arredondar pra cima.
    espacamento_mm = espacamento_estribo_cm * 10
    return int(math.ceil((ALTURA_COLUNA_MM / espacamento_mm) + 1))

def _peso_estribos_coluna_ret(largura_cm: int, comprimento_cm: int, bitola_estribo_mm: float, qtd_estribos: int) -> float:
    # Retangular :contentReference[oaicite:8]{index=8}
    qtd_dobras = 5
    perda_dobra_mm = 5
    transpasse_mm = 50

    largura_mm = largura_cm * 10
    comprimento_mm = comprimento_cm * 10

    comprimento_total_mm = (
        largura_mm * 2
        + comprimento_mm * 2
        + transpasse_mm * 2
        + qtd_dobras * perda_dobra_mm
    )
    comprimento_total_m = comprimento_total_mm / 1000.0

    if bitola_estribo_mm == 4.2:
        massa_estribo = 0.109
    elif bitola_estribo_mm == 5.0:
        massa_estribo = 0.154
    elif bitola_estribo_mm == 6.3:
        massa_estribo = 0.245
    else:
        raise ValueError("bitola_estribo_mm inválida")

    peso_unit = comprimento_total_m * massa_estribo
    return peso_unit * qtd_estribos

def _peso_estribos_coluna_red(diametro_cm: int, bitola_estribo_mm: float, qtd_estribos: int) -> float:
    # Redonda :contentReference[oaicite:9]{index=9}
    transpasse_mm = 160
    diametro_mm = diametro_cm * 10

    comprimento_total_mm = (3.15 * diametro_mm) + transpasse_mm
    comprimento_total_m = comprimento_total_mm / 1000.0

    if bitola_estribo_mm == 4.2:
        massa_estribo = 0.109
    elif bitola_estribo_mm == 5.0:
        massa_estribo = 0.154
    elif bitola_estribo_mm == 6.3:
        massa_estribo = 0.245
    else:
        raise ValueError("bitola_estribo_mm inválida")

    peso_unit = comprimento_total_m * massa_estribo
    return peso_unit * qtd_estribos


@router.post("/colunas", response_model=CalculoColunasSaida, response_model_exclude_none=True)
def calcular_colunas(
    dados: CalculoColunasEntrada,
    admin: bool = False,
    x_admin_token: str | None = Header(default=None)
):
    admin_autorizado = token_admin_valido(x_admin_token)

    if admin and not admin_autorizado:
        raise HTTPException(status_code=401, detail="Invalid admin token.")

    precos = carregar_precos()
    tabela = []
    total_geral = 0.0
    peso_total_geral = 0.0

    for idx, c in enumerate(dados.colunas, start=1):
        qtd_estribos = _qtd_estribos_por_coluna(c.espacamento_estribo_cm)

        if c.formato_coluna == "retangular":
            if c.largura_coluna_cm is None or c.comprimento_coluna_cm is None:
                raise HTTPException(422, detail=f"Coluna item {idx}: retangular exige largura_coluna_cm e comprimento_coluna_cm.")

            qtd_barras = c.quantidade_ferro_ret or 4

            peso_estribos = _peso_estribos_coluna_ret(
                c.largura_coluna_cm, c.comprimento_coluna_cm, c.bitola_estribo_mm, qtd_estribos
            )

            # ferro longitudinal: (peso_barra/2) por barra :contentReference[oaicite:10]{index=10}
            peso_ferro = qtd_barras * (_peso_barra_kg(c.bitola_ferro_mm) / 2.0)

            peso_unit = peso_estribos + peso_ferro
            valor_unit = peso_unit * precos["valor_kg_ferro_coluna_ret"]

            if c.bitola_ferro_mm == 6:
                valor_unit *= FATOR_BITOLA_6MM

            valor_unit = _aplicar_desconto(valor_unit, dados.desconto_percent)
            valor_unit_2 = _arredondar_para_cima(valor_unit, 2)

            formato_nome = c.formato_coluna.capitalize()

            ferro_txt = _bitola_ferro_texto(c.bitola_ferro_mm)
            estribo_txt = f"{c.bitola_estribo_mm}mm"
            descricao = (
                f"Coluna {formato_nome}: {qtd_barras}un Ferro {ferro_txt} - "
                f"{c.largura_coluna_cm}x{c.comprimento_coluna_cm}cm {estribo_txt}"
            )

        elif c.formato_coluna == "redonda":
            if c.diametro_coluna_cm is None or c.quantidade_ferro_red is None:
                raise HTTPException(422, detail=f"Column item {idx}: round format requires diametro_coluna_cm and quantidade_ferro_red.")

            qtd_barras = c.quantidade_ferro_red

            peso_estribos = _peso_estribos_coluna_red(
                c.diametro_coluna_cm, c.bitola_estribo_mm, qtd_estribos
            )

            peso_ferro = qtd_barras * (_peso_barra_kg(c.bitola_ferro_mm) / 2.0)

            peso_unit = peso_estribos + peso_ferro
            valor_unit = peso_unit * precos["valor_kg_ferro_coluna_red"]

            if c.bitola_ferro_mm == 6:
                valor_unit *= FATOR_BITOLA_6MM

            valor_unit = _aplicar_desconto(valor_unit, dados.desconto_percent)
            valor_unit_2 = _arredondar_para_cima(valor_unit, 2)

            formato_nome = c.formato_coluna.capitalize()

            ferro_txt = _bitola_ferro_texto(c.bitola_ferro_mm)
            estribo_txt = f"{c.bitola_estribo_mm}mm"
            descricao = (
                f"Coluna {formato_nome}: {qtd_barras}un Ferro {ferro_txt} - "
                f"Ø{c.diametro_coluna_cm}cm {estribo_txt}"
            )

        else:
            raise HTTPException(422, detail=f"Column item {idx}: invalid formato_coluna.")

        valor_total = valor_unit * c.quantidade_coluna
        peso_total = peso_unit * c.quantidade_coluna

        icms_st_unit = 0.0

        if dados.tipo_cliente == "revenda":
            icms_st_unit = valor_unit * ICMS_ST_PERCENTUAL

        valor_total_exato = c.quantidade_coluna * (valor_unit_2 + icms_st_unit)

        tabela.append(
            LinhaTabelaColuna(
                item=idx,
                descricao=descricao,
                quantidade=c.quantidade_coluna,
                valor_unitario=_formatar_brl_cima(valor_unit_2),
                valor_total=_formatar_brl_cima(valor_total_exato),
                icms_st=_formatar_brl_cima(icms_st_unit) if dados.tipo_cliente == "revenda" else None,
                peso_unit_kg=_arredondar_para_cima(peso_unit, 3) if admin_autorizado else None,
                peso_total_kg=_arredondar_para_cima(peso_total, 3) if admin_autorizado else None,
                qtd_estribos=qtd_estribos if admin_autorizado else None,
            )
        )

        total_geral += valor_total_exato
        peso_total_geral += peso_total

    return CalculoColunasSaida(
        tabela=tabela,
        total_geral=_formatar_brl_cima(total_geral),
        peso_total_geral_kg=_arredondar_para_cima(peso_total_geral, 3) if admin_autorizado else None,
    )