#!/usr/bin/env python3
"""
resumo.py — transforma a gravação em um pacote pequeno (para_enviar.zip)
=======================================================================
Lê gravacao/eventos_*.jsonl e gravacao/telas/*.jpg e gera:
  resumo/resumo.md        estatísticas, botões mais usados, sequências de cada atendimento
  resumo/transicoes.csv   "clicar em X na tela A leva à tela B" (mapa do que cada botão faz)
  resumo/mapa_calor.png   onde as operadoras mais clicam, desenhado sobre a tela principal
  resumo/telas/*.jpg      uma foto de cada tela diferente (reduzida)
  para_enviar.zip         tudo isso + o registro bruto, comprimido

Antes de enviar, ABRA a pasta resumo/telas e confira se não há dado de cliente.
"""
import collections
import csv
import datetime
import glob
import json
import os
import shutil
import sys
import zipfile

AQUI = os.path.dirname(os.path.abspath(__file__))
GRAVACAO = os.path.join(AQUI, "gravacao")
SAIDA = os.path.join(AQUI, "resumo")
ZIP = os.path.join(AQUI, "para_enviar.zip")
CELULA = 40            # cliques a menos de 40 px viram "o mesmo botão"
PAUSA_ATENDIMENTO = 30  # segundos sem clicar = novo atendimento
LIMITE_ZIP_MB = 18


def ler_eventos(pasta):
    eventos = []
    for arq in sorted(glob.glob(os.path.join(pasta, "eventos_*.jsonl"))):
        with open(arq, encoding="utf-8") as f:
            for linha in f:
                try:
                    eventos.append(json.loads(linha))
                except ValueError:
                    pass
    eventos.sort(key=lambda e: e.get("ts", 0))
    return eventos


def celula(x, y):
    return (x // CELULA, y // CELULA)


def separar_atendimentos(cliques):  # recebe qualquer lista de ações com "ts"
    grupos, atual, ultimo = [], [], None
    for c in cliques:
        if ultimo is not None and c["ts"] - ultimo > PAUSA_ATENDIMENTO:
            grupos.append(atual)
            atual = []
        atual.append(c)
        ultimo = c["ts"]
    if atual:
        grupos.append(atual)
    return grupos


def analisar(eventos):
    cliques = [e for e in eventos if e.get("tipo") == "clique"]
    teclas = collections.Counter(e["tecla"] for e in eventos if e.get("tipo") == "tecla")
    # Códigos digitados (ex.: "12"): a tela de ANTES é a tela em que o PDV estava (resultado da ação anterior).
    codigos = {}
    ultima_tela = None
    for e in eventos:
        if e.get("tipo") in ("clique", "codigo", "tecla") and e.get("tela_depois"):
            if e["tipo"] == "codigo":
                d = codigos.setdefault((e["codigo"], ultima_tela), collections.Counter())
                d[e["tela_depois"]] += 1
                e["tela_antes"] = ultima_tela
            ultima_tela = e["tela_depois"]
    por_botao = {}
    for c in cliques:
        k = (c["tela_antes"],) + celula(c["x"], c["y"])
        d = por_botao.setdefault(k, {"n": 0, "xs": 0, "ys": 0, "depois": collections.Counter()})
        d["n"] += 1
        d["xs"] += c["x"]
        d["ys"] += c["y"]
        d["depois"][c["tela_depois"]] += 1
    # Um atendimento é uma sequência de ações (cliques, códigos digitados e F-keys) sem pausas longas.
    acoes = [e for e in eventos if e.get("tipo") in ("clique", "codigo") or (e.get("tipo") == "tecla" and e.get("tela_depois"))]
    atend = separar_atendimentos(acoes)
    sequencias = collections.Counter()
    for a in atend:
        rotulos = []
        for c in a[:14]:
            if c["tipo"] == "clique":
                rotulos.append("%s@%d,%d" % ((c["tela_antes"],) + celula(c["x"], c["y"])))
            elif c["tipo"] == "codigo":
                rotulos.append("cód %s" % c["codigo"])
            else:
                rotulos.append(c["tecla"].upper())
        sequencias[tuple(rotulos)] += 1
    por_dia = collections.Counter(datetime.datetime.fromtimestamp(c["ts"]).date().isoformat() for c in cliques)
    por_hora = collections.Counter(datetime.datetime.fromtimestamp(c["ts"]).hour for c in cliques)
    longos = collections.Counter(e["digitos"] for e in eventos if e.get("tipo") == "numero_longo")
    return cliques, teclas, por_botao, atend, sequencias, por_dia, por_hora, codigos, longos


def escrever_md(caminho, eventos, cliques, teclas, por_botao, atend, sequencias, por_dia, por_hora, codigos, longos):
    telas = sorted({c["tela_antes"] for c in cliques} | {c["tela_depois"] for c in cliques})
    larg = cliques[0].get("larg") if cliques else "?"
    alt = cliques[0].get("alt") if cliques else "?"
    L = ["# Resumo da gravação do PDV", ""]
    L.append("- Tela: %sx%s pixels" % (larg, alt))
    L.append("- Cliques gravados: **%d** | atendimentos (pausa > %ds): **%d** | telas diferentes: **%d**" % (len(cliques), PAUSA_ATENDIMENTO, len(atend), len(telas)))
    ligacoes = [e for e in eventos if e.get("tipo") == "inicio"]
    if ligacoes:
        L.append("- Vezes que o gravador iniciou (PC ligado): %d" % len(ligacoes))
    if por_dia:
        L.append("- Dias: " + ", ".join("%s (%d cliques)" % kv for kv in sorted(por_dia.items())))
    if por_hora:
        L.append("- Cliques por hora: " + ", ".join("%02dh=%d" % kv for kv in sorted(por_hora.items())))
    if atend:
        tam = sorted(len(a) for a in atend)
        L.append("- Cliques por atendimento: mediana %d, máximo %d" % (tam[len(tam) // 2], tam[-1]))
    L += ["", "## Teclas especiais usadas", ""]
    L.append(", ".join("%s=%d" % kv for kv in teclas.most_common(25)) or "(nenhuma)")
    L += ["", "## Códigos digitados no teclado (código, tela em que estava, vezes, tela que abriu)", ""]
    if codigos:
        L.append("| código | tela antes | vezes | tela depois |")
        L.append("|---|---|---|---|")
        for (cod, antes), c in sorted(codigos.items(), key=lambda kv: -sum(kv[1].values()))[:80]:
            L.append("| %s | %s | %d | %s |" % (cod, antes or "?", sum(c.values()), ", ".join("%s×%d" % kv for kv in c.most_common(3))))
    else:
        L.append("(nenhum)")
    if longos:
        L.append("")
        L.append("Números longos ignorados (só a quantidade de dígitos, sem o valor): " + ", ".join("%d dígitos×%d" % kv for kv in sorted(longos.items())))
    L += ["", "## Botões mais clicados (tela de origem, posição média, vezes, para onde levou)", ""]
    L.append("| tela | x | y | vezes | leva a |")
    L.append("|---|---|---|---|---|")
    for (tela, cx, cy), d in sorted(por_botao.items(), key=lambda kv: -kv[1]["n"])[:60]:
        destino = ", ".join("%s×%d" % kv for kv in d["depois"].most_common(3))
        L.append("| %s | %d | %d | %d | %s |" % (tela, d["xs"] // d["n"], d["ys"] // d["n"], d["n"], destino))
    L += ["", "## Sequências de atendimento mais comuns (até 14 ações: cliques = tela@coluna,linha de células de %dpx; 'cód' = código digitado)" % CELULA, ""]
    for seq, n in sequencias.most_common(25):
        L.append("- %d× : %s" % (n, " → ".join(seq)))
    with open(caminho, "w", encoding="utf-8") as f:
        f.write("\n".join(L) + "\n")


def escrever_csv(caminho, por_botao):
    with open(caminho, "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["tela_antes", "x_medio", "y_medio", "vezes", "tela_depois", "vezes_destino"])
        for (tela, cx, cy), d in sorted(por_botao.items(), key=lambda kv: -kv[1]["n"]):
            for destino, n in d["depois"].most_common():
                w.writerow([tela, d["xs"] // d["n"], d["ys"] // d["n"], d["n"], destino, n])


def mapa_calor(cliques, caminho):
    from PIL import Image, ImageDraw

    if not cliques:
        return False
    base_id = collections.Counter(c["tela_antes"] for c in cliques).most_common(1)[0][0]
    arq = os.path.join(GRAVACAO, "telas", base_id + ".jpg")
    if not os.path.exists(arq):
        return False
    img = Image.open(arq).convert("RGBA")
    cam = Image.new("RGBA", img.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(cam)
    for c in cliques:
        if c["tela_antes"] == base_id:
            d.ellipse([c["x"] - 14, c["y"] - 14, c["x"] + 14, c["y"] + 14], fill=(255, 0, 0, 40))
    Image.alpha_composite(img, cam).convert("RGB").save(caminho)
    return True


def copiar_telas(destino, largura, qualidade):
    from PIL import Image

    os.makedirs(destino, exist_ok=True)
    for arq in sorted(glob.glob(os.path.join(GRAVACAO, "telas", "T*.jpg"))):
        img = Image.open(arq)
        if img.width > largura:
            img = img.resize((largura, int(img.height * largura / img.width)))
        img.convert("RGB").save(os.path.join(destino, os.path.basename(arq)), quality=qualidade)


def montar_zip(largura, qualidade):
    pasta_telas = os.path.join(SAIDA, "telas")
    shutil.rmtree(pasta_telas, ignore_errors=True)
    copiar_telas(pasta_telas, largura, qualidade)
    with zipfile.ZipFile(ZIP, "w", zipfile.ZIP_DEFLATED) as z:
        for raiz, _, arqs in os.walk(SAIDA):
            for a in arqs:
                p = os.path.join(raiz, a)
                z.write(p, os.path.join("resumo", os.path.relpath(p, SAIDA)))
        for arq in sorted(glob.glob(os.path.join(GRAVACAO, "eventos_*.jsonl"))):
            z.write(arq, os.path.join("bruto", os.path.basename(arq)))
    return os.path.getsize(ZIP) / 1e6


def main():
    pasta = GRAVACAO
    if not os.path.isdir(pasta):
        print("Pasta de gravação não encontrada: %s" % pasta)
        return 1
    eventos = ler_eventos(pasta)
    cliques, teclas, por_botao, atend, sequencias, por_dia, por_hora, codigos, longos = analisar(eventos)
    if not cliques:
        print("Nenhum clique gravado ainda.")
        return 1
    os.makedirs(SAIDA, exist_ok=True)
    escrever_md(os.path.join(SAIDA, "resumo.md"), eventos, cliques, teclas, por_botao, atend, sequencias, por_dia, por_hora, codigos, longos)
    escrever_csv(os.path.join(SAIDA, "transicoes.csv"), por_botao)
    mapa_calor(cliques, os.path.join(SAIDA, "mapa_calor.png"))
    for largura, qualidade in ((1000, 70), (800, 60), (640, 50), (480, 45)):
        mb = montar_zip(largura, qualidade)
        if mb <= LIMITE_ZIP_MB:
            break
    print("Pronto: %s (%.1f MB)" % (ZIP, mb))
    print("Confira as fotos em %s antes de enviar." % os.path.join(SAIDA, "telas"))
    return 0


if __name__ == "__main__":
    sys.exit(main())
