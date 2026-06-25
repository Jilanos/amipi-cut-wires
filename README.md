# AMIPI Cut Wires

CLI Node.js pour transformer des exports fil-a-fil en feuilles de coupe fournisseur AMIPI.

L'outil lit un catalogue AMIPI, une FDC de reference et un ou plusieurs exports Excel/CSV. Il resout les references cable par section/couleur, applique les accessoires de debut/fin, puis genere un classeur FDC pret a controler.

## Fonctionnalites

- Lecture des exports `.xlsx` multi-onglets.
- Generation d'un onglet de coupe par onglet source.
- Generation d'un onglet d'epissures associe a chaque onglet de coupe.
- Support des exports `.csv` mono-feuille.
- Priorisation des references AMIPI `IR T2 SPB` pour les sections `>= 0,5 mm²`.
- Conservation du style de la FDC modele.
- Rapport JSON des resolutions et des lignes non resolues.

## Installation

```bash
npm install
```

Le projet utilise `exceljs`. En environnement de travail local, si la dependance n'est pas installee dans ce dossier, le script tente aussi de charger `exceljs` depuis le repo voisin `../electrical-plan-editor`.

## Structure

```text
.
├── src/
│   └── amipi-cut-wires.mjs
├── IN/
│   └── wire-list-*.xlsx
├── data/
│   ├── Liste cables AMIPI.xlsx
│   └── Fdc_CI1250507 Principal CIRCLE.xlsx
└── OUT/
```

Le dossier `IN/` contient les exports fil-a-fil a traiter. Le dossier `data/` contient les fichiers de reference AMIPI et FDC. Le dossier `OUT/` contient les sorties generees.

## Commandes

Generer le catalogue normalise, le rapport et les FDC :

```bash
npm run build
```

Generer uniquement le catalogue normalise :

```bash
npm run catalog
```

Generer uniquement les FDC depuis un catalogue deja genere :

```bash
npm run cut-sheet
```

Verifier la syntaxe du CLI :

```bash
npm run check
```

Verifier le workflow Logics :

```bash
npm run logics:status
npm run logics:health
npm run logics:lint
npm run logics:audit
```

## Entrees

### Catalogue AMIPI

Chemin par defaut :

```text
data/Liste cables AMIPI.xlsx
```

L'onglet `CABLE165` est utilise si present, sinon le premier onglet du classeur est lu.

### FDC modele

Chemin par defaut :

```text
data/Fdc_CI1250507 Principal CIRCLE.xlsx
```

L'onglet `Feuille de coupe` est utilise comme modele de sortie. L'onglet `Epissures`, s'il existe, est retire des fichiers generes.

### Exports fil-a-fil

Chemin par defaut :

```text
IN/
```

Chaque fichier `.xlsx` ou `.csv` est traite. Pour les `.xlsx`, tous les onglets lisibles sont traites.

Colonnes attendues :

- `Name`
- `Technical ID`
- `Color`
- `Begin ID` ou `Begin ref`
- `Begin pin`
- `End ID` ou `End ref`
- `End pin`
- `Section (mm²)`
- `Length (mm)`

Colonnes accessoires utilisees si presentes :

- `Twist group`
- `Begin connection ref`
- `Begin connection name`
- `Begin seal ref`
- `Begin seal name`
- `End connection ref`
- `End connection name`
- `End seal ref`
- `End seal name`

## Sorties

```text
OUT/amipi-cables.normalized.json
OUT/wire-resolution-report.json
OUT/Fdc_generated_<nom-export>.xlsx
```

Si un export source contient plusieurs onglets, le fichier FDC genere contient un onglet de coupe par onglet source.

Dans les onglets de coupe, les lignes sont triees par numero de fil croissant extrait depuis `Technical ID` quand il suit le format `*-W-###`. Par exemple, `LAT-W-025` donne `25`. Si le numero ne peut pas etre extrait, l'ordre de ligne genere reste utilise en secours.

La sortie conserve une structure proche du gabarit fournisseur :

- la ligne 1 reste une ligne vide visible, comme dans le gabarit fournisseur ;
- la ligne 2 rappelle le nom du faisceau en majuscule au-dessus des colonnes de connexion ;
- la ligne 3 affiche les blocs `EXTREMITE 1`, `EXTREMITE 2` et `SUIVI` ;
- la ligne 4 contient les en-tetes fournisseur : `DESIGNATION`, `FIL`, `EPI`, puis `SECT`, `COULEUR`, `CABLE`, `LONG`, les deux blocs d'extremites, `TORSADE` et `COMMENTAIRE` ;
- la colonne `EPI`, placee juste apres `FIL`, rappelle le token de branche d'epissure (`1$`, `2Y`, etc.) du fil quand une extremite est une epissure, et reste vide sinon.

Chaque onglet de coupe a aussi un onglet associe `<nom-onglet> Epissures`. Ces onglets listent les epissures detectees depuis les colonnes `Begin ID` et `End ID` sous forme de tables, avec le nom du faisceau en ligne 1 et une colonne A vide pour rendre la bordure exterieure visible :

- le cote d'un fil (gauche ou droite) est determine par le PIN de l'extremite epissure : pin `L` => cote gauche, pin `R` => cote droite. La position du fil dans `Begin ID` ou `End ID` n'est PAS utilisee pour le cote (elle ne reflete que le sens de trace du modeleur) ;
- si le pin n'est ni `L` ni `R` (vide, numerique, epissure a 3+ branches), le fil n'est pas place au hasard : il suit un repli deterministe (epissure dans `Begin ID` => droite, dans `End ID` => gauche) et la situation est remontee dans le rapport JSON (`spliceSideFlags`) et signalee au build ;
- la premiere colonne de table numerote sequentiellement les fils du cote gauche ;
- la deuxieme colonne de table, de largeur 18, contient les fils du cote gauche (pin `L`) ;
- une colonne vide de largeur 20 separe les fils gauches de la cellule centrale ;
- la colonne centrale contient la cellule noire de l'epissure ;
- une colonne vide de largeur 20 separe la cellule centrale des fils droits ;
- la colonne suivante numerote sequentiellement les fils du cote droit ;
- la derniere colonne, de largeur 18, contient les fils du cote droit (pin `R`) ;
- chaque fil est etiquete par un token fournisseur `FIL*position$` ou `FIL*positionY`, avec le meme numero `FIL` que la feuille de coupe (et non par son `Technical ID`) ;
- le token court correspondant (`position$` ou `positionY`) est reporte en colonne `EPI` de la feuille de coupe ;
- une reference de manchon est ajoutee sous chaque tableau d'epissure : `911594` si la section totale de l'epissure est `>= 4 mm²`, sinon `911586` ;
- les groupes de torsade sont rappeles en phrases de type `Fils 9 et 10 torsadés ensemble` ;
- un fil torsade (colonne `Twist group` non vide) est affiche en gras italique ; le titre de l'epissure correspondante est suffixe ` (torsadé)` ;
- pour les fils torsades, la colonne `COMMENTAIRE` indique la distance apres torsade avec un pas de `13 mm`. La formule utilisee est `L_apres = round(L_export / 1.075)` ;
- les fils d'une meme epissure sont regroupes sous un titre fusionne, centre et en gras ;
- la case du titre de l'epissure a un fond gris 15% ;
- chaque tableau d'epissure a une bordure exterieure epaisse ;
- deux lignes vides separent les tables d'epissures.

Les traits de liaison sont inseres dans le fichier `.xlsx` comme des formes DrawingML `straightConnector1`, en noir et en epaisseur 1,5 pt.

## Workflow Logics

Le dossier `logics/` contient les demandes, backlog items et taches de livraison du projet.

Structure principale :

```text
logics/
├── request/
├── backlog/
├── tasks/
├── specs/
├── product/
├── architecture/
├── external/
└── instructions.md
```

La feature en cours pour les pages d'epissures est suivie par :

- `logics/request/req_000_pages_epissures_sorties_fdc.md`
- `logics/backlog/item_001_ajouter_des_pages_epissures_aux_sorties_fdc.md`
- `logics/tasks/task_001_ajouter_des_pages_epissures_aux_sorties_fdc.md`

Utiliser `logics-manager` pour creer, promouvoir, auditer et fermer les documents de workflow. Les raccourcis `npm run logics:*` couvrent les controles courants.

## Regles de resolution cable

1. La section et la couleur de l'export sont normalisees en cle `section|couleur`.
2. Les couleurs de l'application sont converties vers les codes AMIPI avec une table explicite.
3. Les couleurs libres, vides ou inconnues ne sont pas devinees.
4. Les preferences explicites versionnees (`MANUAL_CABLE_PREFERENCES`) sont appliquees en premier.
5. Les references les plus frequemment observees par couple section/couleur dans la FDC de reference sont appliquees ensuite.
6. S'il reste une ambiguite, la preference simple issue de la FDC de reference est utilisee.
7. Les references du catalogue contenant `IR T2 SPB` et dont la section est `>= 0,5 mm²` sont utilisees en repli prioritaire.
8. En cas de doublon `PSA` / `ES PSA` pour une reference `IR T2 SPB`, la designation `PSA` simple est prioritaire.
9. Si une seule reference correspond, elle est utilisee.
10. Sinon la ligne sort en `UNRESOLVED` dans la FDC et dans le rapport.

Le rapport `OUT/wire-resolution-report.json` indique la raison exacte de resolution (`resolved-by-explicit-preference`, `resolved-by-expected-frequency`, `resolved-by-fdc-preference`, `resolved-by-priority-cable`, `resolved-unique`, etc.).

## Licence

MIT. Voir [LICENSE](LICENSE).
