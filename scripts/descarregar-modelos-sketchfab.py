#!/usr/bin/env python3
"""
Descarrega do Sketchfab os modelos 3D dos brawlers (feitos por fãs) para o
mapa 3D do site. Corre no TEU computador: a firewall do Sketchfab não deixa
servidores na nuvem descarregar, mas deixa a tua ligação de casa.

Como usar:
    python3 descarregar-modelos-sketchfab.py

Pede a tua chave do Sketchfab (em https://sketchfab.com/settings/password,
"API token"). A chave não aparece no ecrã e não fica guardada em lado nenhum.

1. Procura um modelo por brawler (só os que o autor deixa descarregar e com
   licença Creative Commons).
2. Mostra a lista e pergunta se queres descarregar.
3. Grava tudo na pasta "modelos-brawlers", já com os nomes certos
   (mortis.glb, el-primo.glb…), e um "creditos.md" com os autores.

Depois arrastas o conteúdo dessa pasta para:
https://github.com/Brawl2007/brawl-hibrido/upload/claude/analise-correcao-falhas-nyp0ym/client/src/modelos/brawlers

Só usa a biblioteca normal do Python (não é preciso instalar nada).
"""
import getpass
import json
import os
import re
import sys
import time
import unicodedata
import urllib.error
import urllib.parse
import urllib.request

BRAWLERS = ["8-bit","Alli","Amber","Angelo","Ash","Barley","Bea","Belle","Berry","Bibi","Bo","Bolt","Bonnie","Brock","Bull","Buster","Buzz","Byron","Carl","Charlie","Chester","Chuck","Clancy","Colette","Colt","Cordelius","Crow","Damian","Darryl","Doug","Draco","Dynamike","Edgar","El Primo","Emz","Eve","Fang","Finx","Frank","Gale","Gene","Gigi","Glowy","Gray","Griff","Grom","Gus","Hank","Jacky","Jae-yong","Janet","Jessie","Juju","Kaze","Kenji","Kit","Larry & Lawrie","Leon","Lily","Lola","Lou","Lumi","Maisie","Mandy","Max","Meeple","Meg","Melodie","Mico","Mina","Moe","Mortis","Mr. P","Najia","Nani","Nita","Nori","Ollie","Otis","Pam","Pearl","Penny","Pierce","Piper","Poco","R-T","Rico","Rosa","Ruffs","Sam","Sandy","Shade","Shelly","Sirius","Spike","Sprout","Squeak","Starr Nova","Stu","Surge","Tara","Tick","Trunk","Wendy","Willow","Ziggy"]

# Licenças que deixam usar o modelo num site pessoal (sem ser para vender).
LICENCAS_BOAS = {"by", "by-sa", "by-nd", "by-nc", "by-nc-sa", "by-nc-nd", "cc0"}
PASTA = "modelos-brawlers"
LIMITE_DO_GITHUB = 25 * 1024 * 1024  # o upload pelo site do GitHub aceita até 25 MB por ficheiro
API = "https://api.sketchfab.com/v3"


def slug(nome):
    nome = unicodedata.normalize("NFD", nome)
    nome = "".join(c for c in nome if unicodedata.category(c) != "Mn").lower()
    return re.sub(r"[^a-z0-9]+", "-", nome).strip("-")


def pedir(url, chave=None, tentativas=4):
    cabecalhos = {"Accept": "application/json"}
    if chave:
        cabecalhos["Authorization"] = "Token " + chave
    for tentativa in range(tentativas):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=cabecalhos), timeout=60) as resposta:
                if resposta.status == 202:
                    raise RuntimeError("O Sketchfab pediu uma verificação anti-robôs. Espera uns minutos e tenta outra vez.")
                return json.load(resposta)
        except urllib.error.HTTPError as erro:
            if erro.code == 429:  # demasiados pedidos: espera e volta a tentar
                time.sleep(10 * (tentativa + 1))
                continue
            if erro.code == 401:
                sys.exit("A chave do Sketchfab foi recusada. Confirma-a em https://sketchfab.com/settings/password")
            raise
    raise RuntimeError("O Sketchfab não respondeu depois de várias tentativas.")


def licenca_de(modelo, chave):
    licenca = modelo.get("license")
    if not isinstance(licenca, dict):
        licenca = (pedir(f"{API}/models/{modelo['uid']}", chave).get("license") or {})
    return (licenca.get("slug") or "").lower(), licenca.get("label") or "?"


def e_deste_brawler(modelo, nome):
    """O nome do brawler tem de estar no título, e Brawl Stars no título ou nas etiquetas."""
    titulo = modelo.get("name", "").lower()
    etiquetas = " ".join(t.get("name", "") for t in modelo.get("tags", [])).lower()
    palavras = re.escape(nome.lower()).replace(r"\ ", r"[\s_-]*")
    if not re.search(rf"(^|[^a-z0-9]){palavras}([^a-z0-9]|$)", titulo):
        return False
    return "brawl" in titulo or "brawl" in etiquetas


def procurar(nome, chave):
    q = urllib.parse.urlencode({"type": "models", "downloadable": "true", "q": f"{nome} brawl stars", "count": 24})
    resultados = pedir(f"{API}/search?{q}", chave).get("results", [])
    candidatos = [m for m in resultados if m.get("isDownloadable") and e_deste_brawler(m, nome)]
    # Primeiro os que têm animações, depois os mais gostados.
    candidatos.sort(key=lambda m: (m.get("animationCount", 0) > 0, m.get("likeCount", 0)), reverse=True)
    for modelo in candidatos:
        licenca, rotulo = licenca_de(modelo, chave)
        if licenca in LICENCAS_BOAS:
            return modelo, rotulo
    return None, None


def descarregar(url, destino):
    with urllib.request.urlopen(url, timeout=300) as resposta, open(destino, "wb") as ficheiro:
        while bloco := resposta.read(1 << 16):
            ficheiro.write(bloco)


def main():
    chave = os.environ.get("SKETCHFAB_API_TOKEN") or getpass.getpass("Chave do Sketchfab (não aparece ao escrever): ").strip()
    if not chave:
        sys.exit("Sem chave não dá para descarregar.")
    pedir(f"{API}/me", chave)  # confirma a chave antes de começar
    os.makedirs(PASTA, exist_ok=True)

    print(f"\nA procurar {len(BRAWLERS)} brawlers no Sketchfab (demora uns minutos)...\n")
    achados, em_falta = [], []
    for i, nome in enumerate(BRAWLERS, 1):
        try:
            modelo, licenca = procurar(nome, chave)
        except Exception as erro:  # um brawler que falha não pára os outros
            print(f"  [{i:3}/{len(BRAWLERS)}] {nome}: erro ({erro})")
            em_falta.append(nome)
            continue
        if modelo:
            anim = f", {modelo.get('animationCount')} animações" if modelo.get("animationCount") else ""
            print(f"  [{i:3}/{len(BRAWLERS)}] {nome}: {modelo['name']} — {modelo['user']['username']} ({licenca}{anim})")
            achados.append((nome, modelo, licenca))
        else:
            print(f"  [{i:3}/{len(BRAWLERS)}] {nome}: nada")
            em_falta.append(nome)
        time.sleep(0.5)

    print(f"\nEncontrei {len(achados)} de {len(BRAWLERS)}. Em falta: {', '.join(em_falta) or 'nenhum'}")
    if not achados or input("\nDescarregar os encontrados? (s/n) ").strip().lower() not in ("s", "sim", "y"):
        return

    creditos = ["# Créditos dos modelos 3D", "", "| Brawler | Modelo | Autor | Licença |", "|---|---|---|---|"]
    grandes = []
    for nome, modelo, licenca in achados:
        destino_glb = os.path.join(PASTA, slug(nome) + ".glb")
        if os.path.exists(destino_glb):
            print(f"  {nome}: já existe, salto")
        else:
            try:
                ligacoes = pedir(f"{API}/models/{modelo['uid']}/download", chave)
                if "glb" in ligacoes:
                    descarregar(ligacoes["glb"]["url"], destino_glb)
                    destino = destino_glb
                else:  # só há glTF em zip: vai assim e converte-se depois
                    destino = os.path.join(PASTA, slug(nome) + ".zip")
                    descarregar(ligacoes["gltf"]["url"], destino)
                tamanho = os.path.getsize(destino)
                print(f"  {nome}: {os.path.basename(destino)} ({tamanho / 1e6:.1f} MB)")
                if tamanho > LIMITE_DO_GITHUB:
                    grandes.append(os.path.basename(destino))
            except Exception as erro:
                print(f"  {nome}: não consegui descarregar ({erro})")
                continue
            time.sleep(1)
        url = modelo.get("viewerUrl") or f"https://sketchfab.com/3d-models/{modelo['uid']}"
        creditos.append(f"| {nome} | [{modelo['name']}]({url}) | {modelo['user']['username']} | {licenca} |")

    with open(os.path.join(PASTA, "creditos.md"), "w", encoding="utf-8") as ficheiro:
        ficheiro.write("\n".join(creditos) + "\n")
    print(f"\nPronto: está tudo na pasta \"{os.path.abspath(PASTA)}\".")
    if grandes:
        print("Estes passam dos 25 MB do GitHub; reduz primeiro em https://gltf.report (Export → GLB):")
        for nome in grandes:
            print("  -", nome)
    print("Arrasta os ficheiros para:")
    print("https://github.com/Brawl2007/brawl-hibrido/upload/claude/analise-correcao-falhas-nyp0ym/client/src/modelos/brawlers")


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\nParado.")
