# AMIPI Cut Wires

CLI Node.js pour transformer des exports fil-a-fil en feuilles de coupe fournisseur AMIPI.

L'outil lit un catalogue AMIPI, une FDC de reference et un ou plusieurs exports Excel/CSV. Il resout les references cable par section/couleur, applique les accessoires de debut/fin, puis genere un classeur FDC pret a controler.

## Fonctionnalites

- Lecture des exports `.xlsx` multi-onglets.
- Generation d'un onglet de coupe par onglet source.
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
├── inputs/
│   ├── amipi/
│   │   └── Liste cables AMIPI.xlsx
│   └── templates/
│       └── Fdc_CI1250507 Principal CIRCLE.xlsx
├── examples/
│   └── exports/
├── data/
├── reports/
└── out/
```

Les dossiers `data/`, `reports/` et `out/` sont des sorties generees.

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

## Entrees

### Catalogue AMIPI

Chemin par defaut :

```text
inputs/amipi/Liste cables AMIPI.xlsx
```

L'onglet `CABLE165` est utilise si present, sinon le premier onglet du classeur est lu.

### FDC modele

Chemin par defaut :

```text
inputs/templates/Fdc_CI1250507 Principal CIRCLE.xlsx
```

L'onglet `Feuille de coupe` est utilise comme modele de sortie. L'onglet `Epissures`, s'il existe, est retire des fichiers generes.

### Exports fil-a-fil

Chemin par defaut :

```text
examples/exports/
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
data/amipi-cables.normalized.json
reports/wire-resolution-report.json
out/Fdc_generated_<nom-export>.xlsx
```

Si un export source contient plusieurs onglets, le fichier FDC genere contient un onglet de coupe par onglet source.

## Regles de resolution cable

1. La section et la couleur de l'export sont normalisees en cle `section|couleur`.
2. Les couleurs de l'application sont converties vers les codes AMIPI avec une table explicite.
3. Les couleurs libres, vides ou inconnues ne sont pas devinees.
4. Les references du catalogue contenant `IR T2 SPB` et dont la section est `>= 0,5 mm²` sont prioritaires.
5. En cas de doublon `PSA` / `ES PSA` pour une reference `IR T2 SPB`, la designation `PSA` simple est prioritaire.
6. S'il reste une ambiguite, la preference issue de la FDC de reference est utilisee.
7. Si une seule reference correspond, elle est utilisee.
8. Sinon la ligne sort en `UNRESOLVED` dans la FDC et dans le rapport.

## Licence

MIT. Voir [LICENSE](LICENSE).
