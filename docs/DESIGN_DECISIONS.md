# DESIGN_DECISIONS.md — Pourquoi ces choix

## Philosophie de base
**Laisser les IA libres.** Le prompt décrit la réalité, pas des ordres. Toute décision qui réduit la liberté de l'agent est rejetée. Les civs ne savent rien par défaut — chaque information se gagne.

---

## Simulation

### 1 tick = 1 mois (12 ticks/an)
Granularité suffisante pour des décisions significatives (saisons, constructions, naissances).
Un an trop court → trop d'urgences. Un an trop long → pas de feedback.

### La terre ne produit RIEN sans travailleurs
Rejet de la production automatique des biomes. Oblige l'IA à choisir des métiers.
Sans `AFFECTER`, 0 nourriture → famine garantie.

### 1 bâtiment par case — pas de doublons
Chaque `CRÉER` = case indépendante. Le frontend regroupe visuellement (🌾 Ferme ×3).
Évite l'inflation invisible et rend les choix d'aménagement réels.

### Population de départ : 100
Assez grande pour voir des effets immédiats. 50 c'était trop fragile.

### Spawn en Mars (tick=2)
Évite la mort instantanée en hiver lors du premier tick.

---

## Moral

### Frustration cumulative sans plafond
Rejet d'un plafond. La frustration doit être douloureuse et croissante.
Formule : `malus = -round(frustration_ticks * 0.5)`, borné à `moralMalus × 4`.

### Révolte à moral < 20
Chance = `(20 - moral) * 0.02`. Perte : 3% pop + 2 cases de territoire random.

### Moral base neutre = 60
Ni optimiste (100) ni pessimiste (0). L'IA doit mériter un bon moral.

---

## LLM & Prompt

### Prompt V3 : narratif, qualitatif, sans chiffres bruts
Chiffres exacts → l'IA optimise au lieu de décider. Descriptions → l'IA imagine.
`describePopulation`, `describeResources`, `describeMood` etc.

### Format réponse : STRATÉGIE + EFFETS (pas de JSON)
JSON → erreurs d'échappement fréquentes avec les modèles locaux.
Texte libre avec verbes-clés → plus robuste, plus naturel.

### Question ouverte dynamique
Adaptée à la situation du tick (tension > satisfaction > stable).
Oblige l'IA à réagir au contexte réel.

---

## Ressources

### 12 ressources distinctes
Nourriture, bois, pierre, glaise, silex, sable, sel, cuivre, étain, fer, or, charbon.
Choix délibéré : assez pour la profondeur, pas trop pour la lisibilité.

### Armée séparée de la population
`army_soldiers` ≠ population. Recrutement via `AFFECTER N → armée`.
Évite le bug "toute la pop est soldats".

---

## Information entre civs (Brouillard de Guerre)

### Découverte par adjacence territoriale
`discoverAdjacentCivs()` : scan des cases voisines. Aucune civ ne connaît l'autre par défaut.

### Espionnage, émissaires, marchands
Missions à durée (civ_processes). Résolution au tick de fin.
Seul vecteur d'information à distance.

---

## Ce qui a été délibérément supprimé
- ❌ Âges technologiques (`TECH_THRESHOLDS`) → remplacés par découverte libre
- ❌ Production automatique des biomes
- ❌ Système de doublons/fusion de structures
- ❌ Connaissance mutuelle des civs au départ
- ❌ Cap nourriture (9999 — à supprimer si encore présent)
