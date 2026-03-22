# CLAUDE.md — Décisions techniques du projet AI Planet

Ce fichier trace les décisions architecturales et les choix techniques pris au fil du développement.

---

## Stack technique

| Composant   | Choix                          | Raison |
|-------------|-------------------------------|--------|
| Base de données | SQLite via `node:sqlite` (Node.js 24 built-in) | Pas de Docker, simplicité locale |
| Backend     | Node.js + Express + Socket.io  | Temps réel léger |
| Frontend    | React + Vite + Tailwind + Canvas 2D | Rendu carte performant |
| LLM         | Mock LLM (rule-based, FR)      | Pas de clé API requise pour tester |

---

## Décisions architecturales

### 2026-03-20 — Performance carte
**Problème :** Canvas lent à chaque tick (4800 biomes redessinés).
**Décision :** Canvas offscreen pré-rendu 1× via `offscreenRef`, `useEffect([biomes])`. `biomes` retiré des deps de `draw`.

### 2026-03-20 — Persistance biomes
**Problème :** `worldUpdater` persistait les 4800 biomes à chaque tick → blocage event loop.
**Décision :** Ajout du flag `_changed`, seuls les biomes modifiés (~50-200/tick) sont persistés.

### 2026-03-20 — Population souris
**Problème :** Les souris explosaient (taille_portee calculée à 12/taille).
**Décision :** `taille_portee: min(3, 6/taille)` + plafond 150 créatures/espèce dans actionResolver.

### 2026-03-21 — Format réponse LLM
**Problème :** JSON dans les réponses LLM causait des erreurs d'échappement fréquentes.
**Décision :** Format texte simple `ACTION: X / RAISON: Y` — plus robuste, plus lisible.

### 2026-03-21 — Reproduction multi-étapes
**Décision :** Pipeline CHERCHER_PARTENAIRE → SE_REPRODUIRE → gestation countdown → naissance auto.
Durée gestation proportionnelle à la taille (2-3 ticks pour petites créatures, 40-60 pour grandes).

### 2026-03-21 — Pyramide Maslow
**Décision :** Le prompt LLM hiérarchise les besoins 🔴(survie) → 🟠(sécurité) → 🟡(reproduction) → 🟢(social) → ⚪(exploration) pour des comportements plus réalistes.

---

## Conventions de code

- **Ports :** Backend = 4000, Frontend = 3000
- **Tick :** 15s par défaut (configurable via `TICK_INTERVAL_MS` dans `.env`)
- **Cadavres :** TTL = 3 ticks (status='cadavre')
- **Spéciation :** toutes les 50 ticks si population >= 20
- **Migrations SQL :** toujours idempotentes (ALTER TABLE + IF NOT EXISTS)

---

## À ne pas faire

- Pas de Docker (SQLite local uniquement)
- Pas d'authentification (MVP local)
- Pas de PostgreSQL/Redis
- Ne pas utiliser de JSON dans les réponses LLM (utiliser `ACTION: X / RAISON: Y`)
