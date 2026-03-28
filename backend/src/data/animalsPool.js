// Pool d'espèces animales pour la génération aléatoire
// Chaque entrée : { nom, species, type, dangerosite, is_migratory, size_min, size_max }

module.exports = [
  // ==================== AGRESSIF ====================
  {
    nom: "Meute de loups",
    species: "loup",
    type: "agressif",
    dangerosite: 4,
    is_migratory: 0,
    size_min: 4,
    size_max: 12
  },
  {
    nom: "Ours brun",
    species: "ours",
    type: "agressif",
    dangerosite: 5,
    is_migratory: 0,
    size_min: 1,
    size_max: 3
  },
  {
    nom: "Sangliers",
    species: "sanglier",
    type: "agressif",
    dangerosite: 3,
    is_migratory: 0,
    size_min: 3,
    size_max: 8
  },
  {
    nom: "Tigre solitaire",
    species: "tigre",
    type: "agressif",
    dangerosite: 5,
    is_migratory: 0,
    size_min: 1,
    size_max: 2
  },
  {
    nom: "Hyènes",
    species: "hyene",
    type: "agressif",
    dangerosite: 3,
    is_migratory: 0,
    size_min: 3,
    size_max: 10
  },
  {
    nom: "Léopard",
    species: "leopard",
    type: "agressif",
    dangerosite: 4,
    is_migratory: 0,
    size_min: 1,
    size_max: 2
  },
  {
    nom: "Serpent géant",
    species: "serpent",
    type: "agressif",
    dangerosite: 2,
    is_migratory: 0,
    size_min: 1,
    size_max: 1
  },
  // ==================== PEUREUX ====================
  {
    nom: "Troupeau de cerfs",
    species: "cerf",
    type: "peureux",
    dangerosite: 1,
    is_migratory: 1,
    size_min: 5,
    size_max: 20
  },
  {
    nom: "Lapins des plaines",
    species: "lapin",
    type: "peureux",
    dangerosite: 1,
    is_migratory: 0,
    size_min: 10,
    size_max: 30
  },
  {
    nom: "Bison",
    species: "bison",
    type: "peureux",
    dangerosite: 2,
    is_migratory: 1,
    size_min: 3,
    size_max: 10
  },
  {
    nom: "Mouflons",
    species: "mouflon",
    type: "peureux",
    dangerosite: 1,
    is_migratory: 1,
    size_min: 4,
    size_max: 12
  },
  {
    nom: "Antilopes",
    species: "antilope",
    type: "peureux",
    dangerosite: 1,
    is_migratory: 1,
    size_min: 6,
    size_max: 15
  },
  {
    nom: "Éléphants",
    species: "elephant",
    type: "peureux",
    dangerosite: 2,
    is_migratory: 0,
    size_min: 2,
    size_max: 6
  },
  {
    nom: "Chevaux sauvages",
    species: "cheval",
    type: "peureux",
    dangerosite: 1,
    is_migratory: 1,
    size_min: 5,
    size_max: 15
  },
  // ==================== OISEAU ====================
  {
    nom: "Nuée de corbeaux",
    species: "corbeau",
    type: "oiseau",
    dangerosite: 1,
    is_migratory: 1,
    size_min: 20,
    size_max: 50
  },
  {
    nom: "Vol d'oies sauvages",
    species: "oie",
    type: "oiseau",
    dangerosite: 1,
    is_migratory: 1,
    size_min: 10,
    size_max: 30
  },
  {
    nom: "Aigles",
    species: "aigle",
    type: "oiseau",
    dangerosite: 2,
    is_migratory: 0,
    size_min: 1,
    size_max: 4
  },
  {
    nom: "Faucons",
    species: "faucon",
    type: "oiseau",
    dangerosite: 1,
    is_migratory: 0,
    size_min: 2,
    size_max: 6
  },
  {
    nom: "Pélicans",
    species: "pelican",
    type: "oiseau",
    dangerosite: 1,
    is_migratory: 1,
    size_min: 5,
    size_max: 15
  },
  {
    nom: "Hiboux",
    species: "hibou",
    type: "oiseau",
    dangerosite: 1,
    is_migratory: 0,
    size_min: 3,
    size_max: 8
  }
];