# Modelos 3D dos brawlers

Os ficheiros `.glb` desta pasta substituem os bonecos simples no mapa 3D do general,
mas só para os brawlers que tiverem ficheiro. O site só descarrega os modelos de quem está no mapa.

## Nomes dos ficheiros

- **Modelo:** `nome.glb`, com o nome da tabela abaixo.
- **Animações:** podem vir dentro do modelo ou em ficheiros à parte, com o nome da animação
  depois de um `@`, por exemplo:
  - `mortis@parado.glb`
  - `mortis@anda.glb`
  - `mortis@ataque.glb`
  - `mortis@super.glb`

O site reconhece estes nomes de animação, em português ou em inglês:

| Momento | Nomes aceites |
|---|---|
| parado | `idle`, `parado`, `stand` |
| a andar | `walk`, `run`, `anda`, `corre` |
| ataque | `attack`, `ataque`, `shoot`, `fire` |
| super | `super`, `ulti`, `especial` |

Se o modelo trouxer só uma animação, essa passa a ser a animação de "parado".

## Formato

- **Tipo:** `.glb` (glTF binário). Um `.fbx` ou `.dae` converte-se no Blender:
  *File → Export → glTF 2.0 (.glb)*, com *Animation* ligado.
- **Tamanho e posição:** não importam. O site mede o modelo, põe-lhe a altura de um brawler
  e assenta-o no chão.
- **Frente:** o modelo deve olhar para a frente (+Z), como é o padrão do glTF.

## Nome de cada brawler

| Brawler | Ficheiro |
|---|---|
| 8-bit | `8-bit.glb` |
| Alli | `alli.glb` |
| Amber | `amber.glb` |
| Angelo | `angelo.glb` |
| Ash | `ash.glb` |
| Barley | `barley.glb` |
| Bea | `bea.glb` |
| Belle | `belle.glb` |
| Berry | `berry.glb` |
| Bibi | `bibi.glb` |
| Bo | `bo.glb` |
| Bolt | `bolt.glb` |
| Bonnie | `bonnie.glb` |
| Brock | `brock.glb` |
| Bull | `bull.glb` |
| Buster | `buster.glb` |
| Buzz | `buzz.glb` |
| Byron | `byron.glb` |
| Carl | `carl.glb` |
| Charlie | `charlie.glb` |
| Chester | `chester.glb` |
| Chuck | `chuck.glb` |
| Clancy | `clancy.glb` |
| Colette | `colette.glb` |
| Colt | `colt.glb` |
| Cordelius | `cordelius.glb` |
| Crow | `crow.glb` |
| Damian | `damian.glb` |
| Darryl | `darryl.glb` |
| Doug | `doug.glb` |
| Draco | `draco.glb` |
| Dynamike | `dynamike.glb` |
| Edgar | `edgar.glb` |
| El Primo | `el-primo.glb` |
| Emz | `emz.glb` |
| Eve | `eve.glb` |
| Fang | `fang.glb` |
| Finx | `finx.glb` |
| Frank | `frank.glb` |
| Gale | `gale.glb` |
| Gene | `gene.glb` |
| Gigi | `gigi.glb` |
| Glowy | `glowy.glb` |
| Gray | `gray.glb` |
| Griff | `griff.glb` |
| Grom | `grom.glb` |
| Gus | `gus.glb` |
| Hank | `hank.glb` |
| Jacky | `jacky.glb` |
| Jae-yong | `jae-yong.glb` |
| Janet | `janet.glb` |
| Jessie | `jessie.glb` |
| Juju | `juju.glb` |
| Kaze | `kaze.glb` |
| Kenji | `kenji.glb` |
| Kit | `kit.glb` |
| Larry & Lawrie | `larry-lawrie.glb` |
| Leon | `leon.glb` |
| Lily | `lily.glb` |
| Lola | `lola.glb` |
| Lou | `lou.glb` |
| Lumi | `lumi.glb` |
| Maisie | `maisie.glb` |
| Mandy | `mandy.glb` |
| Max | `max.glb` |
| Meeple | `meeple.glb` |
| Meg | `meg.glb` |
| Melodie | `melodie.glb` |
| Mico | `mico.glb` |
| Mina | `mina.glb` |
| Moe | `moe.glb` |
| Mortis | `mortis.glb` |
| Mr. P | `mr-p.glb` |
| Najia | `najia.glb` |
| Nani | `nani.glb` |
| Nita | `nita.glb` |
| Nori | `nori.glb` |
| Ollie | `ollie.glb` |
| Otis | `otis.glb` |
| Pam | `pam.glb` |
| Pearl | `pearl.glb` |
| Penny | `penny.glb` |
| Pierce | `pierce.glb` |
| Piper | `piper.glb` |
| Poco | `poco.glb` |
| R-T | `r-t.glb` |
| Rico | `rico.glb` |
| Rosa | `rosa.glb` |
| Ruffs | `ruffs.glb` |
| Sam | `sam.glb` |
| Sandy | `sandy.glb` |
| Shade | `shade.glb` |
| Shelly | `shelly.glb` |
| Sirius | `sirius.glb` |
| Spike | `spike.glb` |
| Sprout | `sprout.glb` |
| Squeak | `squeak.glb` |
| Starr Nova | `starr-nova.glb` |
| Stu | `stu.glb` |
| Surge | `surge.glb` |
| Tara | `tara.glb` |
| Tick | `tick.glb` |
| Trunk | `trunk.glb` |
| Wendy | `wendy.glb` |
| Willow | `willow.glb` |
| Ziggy | `ziggy.glb` |
