import importlib
import sys
import types
import unittest
from pathlib import Path
from types import SimpleNamespace


ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))


def instalar_stubs_dependencias():
    """Permite rodar testes de regressao neste ambiente sem a venv Windows."""

    class APIRouter:
        def post(self, *args, **kwargs):
            def decorator(func):
                return func

            return decorator

    class HTTPException(Exception):
        def __init__(self, status_code, detail):
            super().__init__(detail)
            self.status_code = status_code
            self.detail = detail

    def Header(default=None):
        return default

    fastapi_stub = types.ModuleType("fastapi")
    fastapi_stub.APIRouter = APIRouter
    fastapi_stub.HTTPException = HTTPException
    fastapi_stub.Header = Header
    sys.modules["fastapi"] = fastapi_stub

    class FakeModel:
        def __init__(self, **kwargs):
            for key, value in kwargs.items():
                setattr(self, key, value)

        def model_dump(self):
            def convert(value):
                if isinstance(value, list):
                    return [convert(item) for item in value]
                if hasattr(value, "model_dump"):
                    return value.model_dump()
                return value

            return {key: convert(value) for key, value in self.__dict__.items()}

    modelos_stub = types.ModuleType("app.modelos")
    for nome in [
        "CalculoEstribosEntrada",
        "CalculoEstribosSaida",
        "LinhaTabelaEstribo",
        "CalculoColunasEntrada",
        "CalculoColunasSaida",
        "LinhaTabelaColuna",
    ]:
        setattr(modelos_stub, nome, type(nome, (FakeModel,), {}))
    sys.modules["app.modelos"] = modelos_stub


instalar_stubs_dependencias()
calculos = importlib.import_module("app.rotas.calculos")
configuracoes = importlib.import_module("app.configuracoes")


class RegressaoCalculosTest(unittest.TestCase):
    def test_estribo_retangular_consumidor_sem_desconto(self):
        dados = SimpleNamespace(
            estribos=[
                SimpleNamespace(
                    formato="retangular",
                    bitola_mm=4.2,
                    largura_cm=7,
                    comprimento_cm=14,
                    diametro_cm=None,
                    quantidade=10,
                )
            ],
            tipo_cliente="consumidor",
            desconto_percent=0,
        )

        resultado = calculos.calcular_estribos(dados, admin=False, x_admin_token=None)

        self.assertEqual(
            resultado.model_dump(),
            {
                "tabela": [
                    {
                        "item": 1,
                        "descricao": "Estribo Retangular 4.2mm - 7x14cm",
                        "quantidade": 10,
                        "valor_unitario": "R$ 0,37",
                        "icms_st": None,
                        "valor_total": "R$ 3,66",
                        "peso_unit_kg": None,
                        "peso_total_kg": None,
                    }
                ],
                "total_geral": "R$ 3,66",
                "peso_total_geral_kg": None,
            },
        )

    def test_estribo_redondo_revenda_com_desconto_e_admin(self):
        dados = SimpleNamespace(
            estribos=[
                SimpleNamespace(
                    formato="redondo",
                    bitola_mm=5.0,
                    largura_cm=None,
                    comprimento_cm=None,
                    diametro_cm=12,
                    quantidade=20,
                )
            ],
            tipo_cliente="revenda",
            desconto_percent=10,
        )

        resultado = calculos.calcular_estribos(
            dados,
            admin=True,
            x_admin_token=configuracoes.TOKEN_ADMIN,
        )

        self.assertEqual(
            resultado.model_dump(),
            {
                "tabela": [
                    {
                        "item": 1,
                        "descricao": "Estribo Redondo 5.0mm - Ø 12cm",
                        "quantidade": 20,
                        "valor_unitario": "R$ 0,54",
                        "icms_st": "R$ 0,05",
                        "valor_total": "R$ 11,57",
                        "peso_unit_kg": 0.083,
                        "peso_total_kg": 1.658,
                    }
                ],
                "total_geral": "R$ 11,57",
                "peso_total_geral_kg": 1.658,
            },
        )

    def test_coluna_retangular_consumidor_bitola_6(self):
        dados = SimpleNamespace(
            colunas=[
                SimpleNamespace(
                    formato_coluna="retangular",
                    bitola_ferro_mm=6,
                    bitola_estribo_mm=4.2,
                    quantidade_ferro_ret=4,
                    largura_coluna_cm=20,
                    comprimento_coluna_cm=30,
                    quantidade_ferro_red=None,
                    diametro_coluna_cm=None,
                    quantidade_coluna=3,
                    espacamento_estribo_cm=23,
                )
            ],
            tipo_cliente="consumidor",
            desconto_percent=0,
        )

        resultado = calculos.calcular_colunas(dados, admin=False, x_admin_token=None)

        self.assertEqual(
            resultado.model_dump(),
            {
                "tabela": [
                    {
                        "item": 1,
                        "descricao": "Coluna Retangular: 4un Ferro 6.3mm - 20x30cm 4.2mm",
                        "quantidade": 3,
                        "valor_unitario": "R$ 64,69",
                        "valor_total": "R$ 194,05",
                        "icms_st": None,
                        "peso_unit_kg": None,
                        "peso_total_kg": None,
                        "qtd_estribos": None,
                    }
                ],
                "total_geral": "R$ 194,05",
                "peso_total_geral_kg": None,
            },
        )

    def test_coluna_redonda_revenda_com_admin(self):
        dados = SimpleNamespace(
            colunas=[
                SimpleNamespace(
                    formato_coluna="redonda",
                    bitola_ferro_mm=8,
                    bitola_estribo_mm=5.0,
                    quantidade_ferro_ret=None,
                    largura_coluna_cm=None,
                    comprimento_coluna_cm=None,
                    quantidade_ferro_red=6,
                    diametro_coluna_cm=25,
                    quantidade_coluna=2,
                    espacamento_estribo_cm=20,
                )
            ],
            tipo_cliente="revenda",
            desconto_percent=5,
        )

        resultado = calculos.calcular_colunas(
            dados,
            admin=True,
            x_admin_token=configuracoes.TOKEN_ADMIN,
        )

        self.assertEqual(
            resultado.model_dump(),
            {
                "tabela": [
                    {
                        "item": 1,
                        "descricao": "Coluna Redonda: 6un Ferro 8mm - Ø25cm 5.0mm",
                        "quantidade": 2,
                        "valor_unitario": "R$ 115,75",
                        "valor_total": "R$ 250,40",
                        "icms_st": "R$ 9,45",
                        "peso_unit_kg": 18.744,
                        "peso_total_kg": 37.487,
                        "qtd_estribos": 31,
                    }
                ],
                "total_geral": "R$ 250,40",
                "peso_total_geral_kg": 37.487,
            },
        )

    def test_estribo_retangular_sem_medidas_retorna_422(self):
        dados = SimpleNamespace(
            estribos=[
                SimpleNamespace(
                    formato="retangular",
                    bitola_mm=4.2,
                    largura_cm=None,
                    comprimento_cm=None,
                    diametro_cm=None,
                    quantidade=2,
                )
            ],
            tipo_cliente="consumidor",
            desconto_percent=0,
        )

        with self.assertRaises(Exception) as ctx:
            calculos.calcular_estribos(dados, admin=False, x_admin_token=None)

        self.assertEqual(ctx.exception.status_code, 422)
        self.assertIn("rectangular format requires largura_cm and comprimento_cm", ctx.exception.detail)


if __name__ == "__main__":
    unittest.main()
