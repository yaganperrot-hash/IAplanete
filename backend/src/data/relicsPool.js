// Pool de reliques — objets concrets légèrement plus avancés que l'ère de la civ qui les trouve.
// Chaque entrée : { name, base_form, material_era, type, domain, era }
// base_form  : description de la forme/fonction (sans matière — ajoutée dynamiquement selon le contexte)
// material_era : matière dont l'objet est fait, calibrée par rapport à ce que la civ connaît

module.exports = [

  // ── ERA PRIMITIF (silex/os) → objet en cuivre ou bronze ─────────────────────

  {
    name: "Couteau à lame persistante",
    base_form: "un couteau à lame courte, parfaitement tranchant",
    material_era: "cuivre",
    type: "objet", domain: "arme", era: "primitif"
  },
  {
    name: "Pointe de lance robuste",
    base_form: "une pointe de lance longue, à double tranchant, dont la base s'emboîte dans un manche",
    material_era: "cuivre",
    type: "objet", domain: "arme", era: "primitif"
  },
  {
    name: "Hache à tranchant durable",
    base_form: "une hache dont le tranchant tient après des dizaines de coups là où le silex s'écaille",
    material_era: "cuivre",
    type: "objet", domain: "outil", era: "primitif"
  },
  {
    name: "Ciseau de tailleur",
    base_form: "un ciseau fin, conçu pour creuser la pierre ou le bois avec précision",
    material_era: "cuivre",
    type: "objet", domain: "outil", era: "primitif"
  },
  {
    name: "Bol à parois minces",
    base_form: "un récipient aux parois régulières, capable de résister au feu sans se fissurer",
    material_era: "bronze",
    type: "objet", domain: "art", era: "primitif"
  },
  {
    name: "Disque gravé de cycles",
    base_form: "un disque plat gravé de cercles concentriques et de repères régulièrement espacés",
    material_era: "bronze",
    type: "objet", domain: "art", era: "primitif"
  },
  {
    name: "Fondations d'un édifice inconnu",
    base_form: "des blocs de pierre assemblés sans mortier avec une régularité que vos bâtisseurs ne maîtrisent pas",
    material_era: "pierre_taillée",
    type: "construction", domain: "ruines", era: "primitif"
  },
  {
    name: "Portique taillé",
    base_form: "deux montants de pierre et un linteau posé à plat — une structure que votre peuple n'a jamais construite",
    material_era: "pierre_taillée",
    type: "construction", domain: "ruines", era: "primitif"
  },
  {
    name: "Arc composite",
    base_form: "un arc dont la courbure est maintenue par une matière collée contre le bois, plus puissant que tout ce que vos chasseurs utilisent",
    material_era: "cuivre",
    type: "objet", domain: "arme", era: "primitif"
  },

  // ── ERA METAL (cuivre/bronze) → objet en fer ou acier ───────────────────────

  {
    name: "Lame à grain serré",
    base_form: "une lame longue dont le grain est si fin qu'il ne rouillerait pas même dans l'eau",
    material_era: "fer",
    type: "objet", domain: "arme", era: "metal"
  },
  {
    name: "Herminette de charpentier",
    base_form: "un outil à tranchant incurvé, conçu pour dégrossir les poutres avec une vitesse que vos artisans n'atteignent pas",
    material_era: "fer",
    type: "objet", domain: "outil", era: "metal"
  },
  {
    name: "Foret à mèche hélicoïdale",
    base_form: "un outil dont la spirale creuse le bois ou la pierre en tournant, sans forcer",
    material_era: "fer",
    type: "objet", domain: "outil", era: "metal"
  },
  {
    name: "Bouclier à nervures",
    base_form: "un bouclier léger dont les nervures renforcent la surface sans en augmenter le poids",
    material_era: "acier",
    type: "objet", domain: "arme", era: "metal"
  },
  {
    name: "Charnière de porte",
    base_form: "un mécanisme à pivot qui permet à un panneau lourd de s'ouvrir et se fermer sans s'user",
    material_era: "fer",
    type: "objet", domain: "outil", era: "metal"
  },
  {
    name: "Aqueduc souterrain partiel",
    base_form: "un canal enterré dans la roche, parfaitement jointoyé, où l'eau circule encore",
    material_era: "pierre_taillée",
    type: "construction", domain: "ruines", era: "metal"
  },
  {
    name: "Tour d'angle en blocs réguliers",
    base_form: "une tour dont chaque bloc est identique, posé sans mortier mais impossible à désolidariser",
    material_era: "pierre_taillée",
    type: "construction", domain: "ruines", era: "metal"
  },
  {
    name: "Panneau gravé de scènes",
    base_form: "une dalle couverte de scènes de la vie quotidienne d'un peuple inconnu, gravées avec une précision que vos artisans n'ont pas",
    material_era: "fer",
    type: "art", domain: "art", era: "metal"
  },

  // ── ERA AVANCÉ (fer/acier) → objet hors de portée ───────────────────────────

  {
    name: "Ressort en spirale",
    base_form: "un anneau de métal enroulé sur lui-même qui reprend sa forme après compression",
    material_era: "inconnu",
    type: "objet", domain: "outil", era: "avance"
  },
  {
    name: "Feuille de verre soufflé",
    base_form: "une surface transparente et plane, ni bois ni pierre, qui laisse passer la lumière sans la bloquer",
    material_era: "inconnu",
    type: "objet", domain: "art", era: "avance"
  },

];
