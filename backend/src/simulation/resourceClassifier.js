'use strict';

const RULES = [
  { rx: /hache|lance|épée|couteau|arc|arme|massue|bouclier|silex.*(arm|outil)|arm.*silex|lances|couteaux|armes/,
    category: 'arme', stat: 'military_power', per_unit: 0.3 },
  { rx: /outil|pioche|houe|faucille|ciseau|marteau|pelle|sickle|hache(?!.*arme)/,
    category: 'outil', stat: 'production_pct', per_unit: 0.015 },
  { rx: /pot|poterie|récipient|cruche|jarre|amphore|bol|stockage|réserve|cuve|sac.*peau|conteneur/,
    category: 'stockage', stat: 'food_capacity', per_unit: 15 },
  { rx: /couverture|tissu|textile|vêtement|manteau|tente|peau(?!.*sac)|habit|linge/,
    category: 'textile', stat: 'moral', per_unit: 0.4 },
  { rx: /sculpture|œuvre|art|décor|peinture|bijou|statue|fresque|ornement/,
    category: 'art', stat: 'moral', per_unit: 0.6 },
  { rx: /offrande|rituel|sacré|prière|relique|icône|totem|amulette/,
    category: 'spirituel', stat: 'moral', per_unit: 0.8 },
];

function classify(name) {
  const n = (name || '').toLowerCase();
  for (const r of RULES) {
    if (r.rx.test(n)) return { category: r.category, stat: r.stat, per_unit: r.per_unit };
  }
  return { category: 'divers', stat: null, per_unit: 0 };
}

module.exports = { classify };
