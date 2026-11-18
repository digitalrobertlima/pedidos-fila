#!/usr/bin/env python3
"""
gravador.py — GRAVADOR PASSIVO DO PDV (só observa, NUNCA clica nem digita)
==========================================================================
Fica rodando em segundo plano no computador do caixa durante alguns dias,
enquanto as operadoras trabalham normalmente. Para cada clique do mouse ele
anota: hora, posição, botão, tela antes e tela depois. Guarda uma foto de cada
TELA DIFERENTE (não de cada clique), então ocupa pouco espaço.

PRIVACIDADE
  - Teclas digitadas NÃO são gravadas: só teclas especiais (F1..F12, Enter,
    Esc, Tab...). Letras e números viram só "digito"/"caractere", sem valor.
  - As fotos de tela podem mostrar o que estiver na tela (nome da operadora,
    um CPF na nota...). Antes de enviar o pacote a alguém, confira a pasta.
  - Use --janela para gravar SÓ quando o PDV estiver na frente.

ATALHOS (valem em qualquer janela)
  Ctrl+Alt+P  pausa / retoma a gravação (ex.: ao digitar CPF do cliente)
  Ctrl+Alt+Q  encerra o gravador

USO
  python gravador.py --descobrir              (mostra o título da janela do PDV)
  python gravador.py --janela "Degust"        (grava só quando o PDV está na frente)
"""
import argparse
import datetime
import json
import os
import queue
import sys
import threading
import time

from PIL import Image, ImageChops

PASTA_PADRAO = os.path.join(os.path.dirname(os.path.abspath(__file__)), "gravacao")
MINI = (96, 60)        # tamanho da miniatura usada para comparar telas
LIMIAR_COR = 48        # um ponto "mudou" se a diferença de cor passar disso (0-255)
LIMIAR_FRACAO = 0.004  # menos de 0,4% de pontos mudados = mesma tela
MAX_TELAS = 600        # máximo de fotos de telas diferentes guardadas
TECLAS_ESPECIAIS_IGNORADAS = {"shift", "shift_r", "ctrl_l", "ctrl_r", "alt_l", "alt_r", "alt_gr", "caps_lock", "cmd"}


# ----------------------------------------------------------------------------
# Utilidades (puras — testáveis em qualquer sistema)
# ----------------------------------------------------------------------------
def miniatura(img):
    """Miniatura colorida 96x60 usada para comparar telas."""
    return img.convert("RGB").resize(MINI, Image.BILINEAR)


def fracao_diferente(a, b):
    """Parte (0 a 1) dos pontos da miniatura que mudaram bastante entre duas telas."""
    dif = ImageChops.difference(a, b).convert("L")
    return sum(dif.histogram()[LIMIAR_COR:]) / float(MINI[0] * MINI[1])


class CatalogoTelas:
    """Dá um id (T001, T002...) a cada tela diferente e diz se é a primeira vez que ela aparece.

    Duas fotos são "a mesma tela" se menos de 0,4% da miniatura mudou — assim a lista de itens
    do cupom crescendo não cria tela nova, mas outra página de produtos ou um pop-up cria.
    Na dúvida o gravador separa demais (melhor do que misturar telas diferentes)."""

    def __init__(self, max_telas=MAX_TELAS):
        self.itens = []  # [(miniatura, id)]
        self.max_telas = max_telas
        self.ultimo = None
        self.trava = threading.Lock()

    def identificar(self, img):
        m = miniatura(img)
        with self.trava:
            if self.ultimo is not None and fracao_diferente(m, self.ultimo[0]) <= LIMIAR_FRACAO:
                return self.ultimo[1], False
            melhor = None
            for mm, tid in self.itens:
                f = fracao_diferente(m, mm)
                if melhor is None or f < melhor[0]:
                    melhor = (f, tid, mm)
            if melhor and (melhor[0] <= LIMIAR_FRACAO or len(self.itens) >= self.max_telas):
                self.ultimo = (melhor[2], melhor[1])
                return melhor[1], False
            tid = "T%03d" % (len(self.itens) + 1)
            self.itens.append((m, tid))
            self.ultimo = (m, tid)
            return tid, True


def titulo_janela_ativa():
    """Título da janela que está na frente (só Windows)."""
    if os.name != "nt":
        return ""
    import ctypes

    u = ctypes.windll.user32
    h = u.GetForegroundWindow()
    n = u.GetWindowTextLengthW(h)
    buf = ctypes.create_unicode_buffer(n + 1)
    u.GetWindowTextW(h, buf, n + 1)
    return buf.value


def ativar_dpi():
    """Faz as coordenadas do mouse coincidirem com os pixels reais da tela."""
    if os.name != "nt":
        return
    import ctypes

    try:
        ctypes.windll.shcore.SetProcessDpiAwareness(2)
    except Exception:
        try:
            ctypes.windll.user32.SetProcessDPIAware()
        except Exception:
            pass


# ----------------------------------------------------------------------------
# Gravador
# ----------------------------------------------------------------------------
class Gravador:
    def __init__(self, pasta, filtro_janela="", atraso_depois=0.7):
        self.pasta = pasta
        self.pasta_telas = os.path.join(pasta, "telas")
        os.makedirs(self.pasta_telas, exist_ok=True)
        self.filtro = filtro_janela.lower().strip()
        self.atraso = atraso_depois
        self.catalogo = CatalogoTelas()
        self.fila_antes = queue.Queue()
        self.fila_depois = queue.Queue()
        self.parar = threading.Event()
        self.pausado = False
        self.trava_escrita = threading.Lock()
        self.contador = 0
        self.tela_wh = (0, 0)
        # Continua a numeração de telas se o gravador foi reiniciado.
        self._retomar_catalogo()

    # -- persistência --------------------------------------------------------
    def _retomar_catalogo(self):
        for nome in sorted(os.listdir(self.pasta_telas)):
            if nome.startswith("T") and nome.endswith(".jpg"):
                try:
                    img = Image.open(os.path.join(self.pasta_telas, nome))
                    self.catalogo.itens.append((miniatura(img), nome[:-4]))
                except Exception:
                    pass

    def escrever(self, obj):
        obj["ts"] = obj.get("ts") or time.time()
        obj["quando"] = datetime.datetime.fromtimestamp(obj["ts"]).isoformat(timespec="milliseconds")
        arq = os.path.join(self.pasta, "eventos_%s.jsonl" % datetime.date.today().isoformat())
        with self.trava_escrita:
            with open(arq, "a", encoding="utf-8") as f:
                f.write(json.dumps(obj, ensure_ascii=False) + "\n")
            self.contador += 1
            if self.contador % 50 == 0:
                print("  %d eventos gravados (%d telas diferentes)" % (self.contador, len(self.catalogo.itens)))

    def _identificar_e_salvar(self, img):
        tid, nova = self.catalogo.identificar(img)
        if nova:
            img.convert("RGB").save(os.path.join(self.pasta_telas, tid + ".jpg"), quality=60)
        return tid

    # -- filtros ---------------------------------------------------------------
    def _deve_gravar(self):
        if self.pausado:
            return False, ""
        titulo = titulo_janela_ativa()
        if self.filtro and self.filtro not in titulo.lower():
            return False, titulo
        return True, titulo

    # -- chamados pelos "ouvintes" do teclado/mouse (têm de ser rápidos) -------
    def ao_clicar(self, x, y, botao, pressionado):
        if not pressionado:
            return
        ok, titulo = self._deve_gravar()
        if ok:
            self.fila_antes.put((time.time(), int(x), int(y), str(botao).replace("Button.", ""), titulo))

    def ao_tecla(self, tecla):
        ok, _ = self._deve_gravar()
        if not ok:
            return
        char = getattr(tecla, "char", None)
        if char is not None:
            nome = "digito" if char.isdigit() else "caractere"
        else:
            nome = str(tecla).replace("Key.", "")
            if nome in TECLAS_ESPECIAIS_IGNORADAS:
                return
        self.escrever({"tipo": "tecla", "tecla": nome})

    # -- trabalhadores (threads) -------------------------------------------------
    def _trabalhador_antes(self):
        import mss

        with mss.mss() as sct:
            mon = sct.monitors[1]
            self.tela_wh = (mon["width"], mon["height"])
            while not self.parar.is_set():
                try:
                    ts, x, y, botao, titulo = self.fila_antes.get(timeout=0.5)
                except queue.Empty:
                    continue
                shot = sct.grab(mon)
                img = Image.frombytes("RGB", shot.size, shot.bgra, "raw", "BGRX")
                tela_antes = self._identificar_e_salvar(img)
                self.fila_depois.put((ts + self.atraso, ts, x, y, botao, titulo, tela_antes))

    def _trabalhador_depois(self):
        import mss

        with mss.mss() as sct:
            mon = sct.monitors[1]
            while not self.parar.is_set():
                try:
                    quando, ts, x, y, botao, titulo, tela_antes = self.fila_depois.get(timeout=0.5)
                except queue.Empty:
                    continue
                espera = quando - time.time()
                if espera > 0:
                    time.sleep(espera)
                shot = sct.grab(mon)
                img = Image.frombytes("RGB", shot.size, shot.bgra, "raw", "BGRX")
                tela_depois = self._identificar_e_salvar(img)
                self.escrever({"tipo": "clique", "ts": ts, "x": x, "y": y, "botao": botao, "janela": titulo,
                               "tela_antes": tela_antes, "tela_depois": tela_depois,
                               "larg": self.tela_wh[0], "alt": self.tela_wh[1]})

    def _pulso(self):
        while not self.parar.wait(300):
            if not self.pausado:
                self.escrever({"tipo": "pulso"})

    # -- controle ---------------------------------------------------------------
    def alternar_pausa(self):
        self.pausado = not self.pausado
        print("  >>> PAUSADO" if self.pausado else "  >>> GRAVANDO")
        self.escrever({"tipo": "pausa" if self.pausado else "retomada"})

    def encerrar(self):
        print("Encerrando…")
        self.escrever({"tipo": "fim"})
        self.parar.set()

    def rodar(self):
        from pynput import keyboard, mouse

        for alvo in (self._trabalhador_antes, self._trabalhador_depois, self._pulso):
            threading.Thread(target=alvo, daemon=True).start()
        self.escrever({"tipo": "inicio", "filtro_janela": self.filtro})
        ouvintes = [
            mouse.Listener(on_click=self.ao_clicar),
            keyboard.Listener(on_press=self.ao_tecla),
            keyboard.GlobalHotKeys({"<ctrl>+<alt>+p": self.alternar_pausa, "<ctrl>+<alt>+q": self.encerrar}),
        ]
        for o in ouvintes:
            o.start()
        print("Gravando em: %s" % self.pasta)
        print("Filtro de janela: %s" % (self.filtro or "(nenhum — grava tudo!)"))
        print("Ctrl+Alt+P pausa/retoma | Ctrl+Alt+Q encerra")
        try:
            while not self.parar.is_set():
                time.sleep(0.5)
        except KeyboardInterrupt:
            self.encerrar()
        for o in ouvintes:
            o.stop()
        time.sleep(1.5)  # deixa as últimas fotos serem gravadas


def descobrir_janela(segundos=40):
    print("Clique na janela do PDV e deixe-a na frente. Mostrando por %ds o título da janela ativa:" % segundos)
    vistos = set()
    fim = time.time() + segundos
    while time.time() < fim:
        t = titulo_janela_ativa()
        if t and t not in vistos:
            vistos.add(t)
            print("  janela ativa: %r" % t)
        time.sleep(0.5)
    print("Use uma parte do título do PDV em --janela (ex.: --janela \"Degust\").")


def main():
    ap = argparse.ArgumentParser(description="Gravador passivo do PDV (só observa).")
    ap.add_argument("--janela", default="", help="grava só quando o título da janela ativa contiver este texto")
    ap.add_argument("--pasta", default=PASTA_PADRAO)
    ap.add_argument("--descobrir", action="store_true", help="mostra o título da janela ativa e sai")
    args = ap.parse_args()
    ativar_dpi()
    if args.descobrir:
        return descobrir_janela()
    if not args.janela:
        print("AVISO: sem --janela o gravador grava cliques de QUALQUER programa.")
        print("Rode antes:  python gravador.py --descobrir\n")
    Gravador(args.pasta, args.janela).rodar()


if __name__ == "__main__":
    sys.exit(main())
