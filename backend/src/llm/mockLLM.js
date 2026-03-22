// Mock LLM : simule les décisions des créatures sans API externe

const RAISON_TEMPLATES = {
  SE_DEPLACER: [
    "Je me déplace pour explorer de nouveaux territoires.",
    "Cette direction semble prometteuse pour trouver de la nourriture.",
    "Je migre vers un biome plus favorable à ma survie.",
    "Il vaut mieux bouger pour éviter la surpopulation ici.",
    "Mon instinct me pousse à explorer cet horizon inconnu.",
    "Je cherche un point d'eau plus proche.",
  ],
  MANGER: [
    "J'ai faim et des ressources sont disponibles ici.",
    "Il faut reconstituer mes réserves d'énergie avant tout.",
    "Cette végétation est abondante, c'est le bon moment pour manger.",
    "Un repas s'impose avant de continuer ma route.",
    "La nourriture est là, autant en profiter.",
  ],
  CHASSER: [
    "J'ai repéré une proie à portée, je passe à l'attaque !",
    "La faim me pousse à chasser cette créature plus faible.",
    "L'occasion est parfaite pour un repas de qualité.",
    "Ce prédateur en moi ne peut résister à une telle proie.",
    "Chasser maintenant, c'est survivre demain.",
  ],
  FUIR: [
    "Un prédateur s'approche, ma survie prime sur tout !",
    "Je sens le danger, mieux vaut fuir rapidement.",
    "Cette menace dépasse mes capacités de combat.",
    "La prudence est la meilleure arme face à cette menace.",
    "Je reviendrai plus tard, mais là il faut partir.",
    "Fuir n'est pas lâcheté, c'est de la sagesse.",
  ],
  SE_CACHER: [
    "Le danger est trop proche, je reste immobile et discret.",
    "Mon camouflage me protégera ici.",
    "Mieux vaut attendre que la menace s'éloigne.",
    "Je préfère observer avant d'agir.",
    "L'obscurité est mon alliée en ce moment.",
  ],
  SE_REPRODUIRE: [
    "Les conditions sont idéales pour assurer ma descendance.",
    "Un partenaire est disponible et j'ai assez d'énergie.",
    "Il est temps de perpétuer mon espèce.",
    "La reproduction est ma priorité absolue en ce moment.",
    "L'abondance de ressources favorise la multiplication.",
  ],
  DORMIR: [
    "Je suis épuisé, je dois récupérer mes forces.",
    "C'est ma période de repos naturelle.",
    "Un bon sommeil et je serai plus efficace demain.",
    "Mes blessures nécessitent du repos pour guérir.",
  ],
  EXPLORER: [
    "Ce territoire est inconnu, je vais explorer.",
    "Je cherche de meilleures ressources ailleurs.",
    "L'instinct de découverte me pousse vers l'inconnu.",
    "Peut-être de meilleures opportunités au-delà de l'horizon.",
    "Je dois trouver un nouveau territoire avant la saison suivante.",
    "Cette zone est épuisée, il est temps de partir.",
  ],
  DEFENDRE_TERRITOIRE: [
    "Cet intrus menace mon territoire, je le repousse !",
    "Je dois défendre ma zone de ressources.",
    "Ma dominance sur ce territoire doit être affirmée.",
    "Personne ne me prend ma nourriture.",
  ],
  ATTAQUER: [
    "Je passe à l'offensive contre cet adversaire.",
    "L'attaque est la meilleure défense dans cette situation.",
    "Je dois éliminer cette menace avant qu'elle ne grandisse.",
    "L'audace sera ma force dans ce combat.",
  ],
  SUIVRE: [
    "Je suis ce congénère pour rester en groupe.",
    "La sécurité est dans le nombre.",
    "Je rejoins mon groupe pour chasser en meute.",
    "Ensemble nous sommes plus forts.",
  ],
  BOIRE: [
    "J'ai soif, je cherche un point d'eau pour me désaltérer.",
    "L'eau est essentielle à ma survie, je dois boire.",
    "Je profite de cette source d'eau à proximité.",
    "Ma survie dépend de mon hydratation.",
  ],
  RIEN: [
    "Je préfère observer la situation avant d'agir.",
    "Rien à faire pour l'instant, je surveille.",
    "Je me repose et j'économise mon énergie.",
    "Je laisse la situation évoluer avant de décider.",
    "Le calme avant la tempête.",
  ],
};

function pickRaison(action) {
  const templates = RAISON_TEMPLATES[action] || RAISON_TEMPLATES.RIEN;
  return templates[Math.floor(Math.random() * templates.length)];
}

/**
 * Décide de l'action d'une espèce selon la pyramide de survie
 * Niveau 1 : Ne pas mourir maintenant
 * Niveau 2 : Ne pas mourir bientôt
 * Niveau 3 : Rester en bonne santé
 * Niveau 4 : Perpétuer l'espèce
 */
function decide(context) {
  const {
    energy = 100, health = 100,
    regime = 'omnivore', social = 'solitaire', rythme = 'diurne', taille = 5,
    isNight = false,
    nearbyFood = 0, nearbyPrey = 0, nearbyThreats = 0, nearbyAllies = 0,
    nearbyMates = 0, nearbyCadavres = 0, nearbyWater = 0,
    traits = [], canReproduce = false, repro_drive = 0,
    adjacentReadyMates = 0, nearbyPetits = 0, reproStatus = 'immature',
  } = context;

  const hasVisionNocturne = traits.includes('vision_nocturne');
  const hasBioluminescence = traits.includes('bioluminescence');
  const effectiveNight = isNight && !hasVisionNocturne && rythme !== 'nocturne' && rythme !== 'crépusculaire';

  // ===== NIVEAU 1 : SURVIE IMMÉDIATE =====
  if (nearbyThreats > 0) {
    if (health < 40 || taille < 4 || regime === 'herbivore') {
      if (Math.random() < 0.75) return { action: 'FUIR', raison: pickRaison('FUIR') };
      return { action: 'SE_CACHER', raison: pickRaison('SE_CACHER') };
    }
    // Grande taille ou carnivore : peut défendre
    if ((social === 'grande_colonie' || social === 'petit_groupe') && nearbyAllies > 2) {
      if (Math.random() < 0.5) return { action: 'DEFENDRE_TERRITOIRE', raison: pickRaison('DEFENDRE_TERRITOIRE') };
    }
    if (Math.random() < 0.4) return { action: 'FUIR', raison: pickRaison('FUIR') };
  }

  // ===== NIVEAU 2 : BESOINS VITAUX =====
  if (health < 30 && nearbyWater > 0) return { action: 'BOIRE', raison: pickRaison('BOIRE') };

  if (energy < 20) {
    if (nearbyFood > 0 && regime !== 'carnivore') return { action: 'MANGER', raison: pickRaison('MANGER') };
    if (nearbyPrey > 0 && ['carnivore', 'omnivore', 'charognard'].includes(regime)) return { action: 'CHASSER', raison: pickRaison('CHASSER') };
    return { action: 'EXPLORER', raison: 'La faim me force à chercher de la nourriture.' };
  }

  if (regime === 'charognard' && nearbyCadavres > 0 && energy < 80) {
    return { action: 'CHASSER', raison: 'Je me nourris de cette carcasse.' };
  }

  if (nearbyPrey > 0 && ['carnivore', 'omnivore'].includes(regime) && energy < 80) {
    const prob = (isNight && hasBioluminescence) ? 0.85 : 0.65;
    if (Math.random() < prob) {
      return { action: 'CHASSER', raison: isNight && hasBioluminescence ? 'Ma bioluminescence attire les proies.' : pickRaison('CHASSER') };
    }
  }

  if (nearbyFood > 0 && energy < 75 && regime !== 'carnivore') {
    if (Math.random() < 0.6) return { action: 'MANGER', raison: pickRaison('MANGER') };
  }

  // ===== NIVEAU 3 : ENTRETIEN =====
  if (effectiveNight && energy < 60) {
    if (Math.random() < 0.5) return { action: 'DORMIR', raison: pickRaison('DORMIR') };
  }
  if (energy < 40) return { action: 'DORMIR', raison: pickRaison('DORMIR') };

  if (nearbyWater > 0 && energy < 60) {
    if (Math.random() < 0.3) return { action: 'BOIRE', raison: pickRaison('BOIRE') };
  }

  // ===== NIVEAU 4 : REPRODUCTION =====
  // 4a. Protéger les petits si menace proche
  if (nearbyPetits > 0 && nearbyThreats > 0) {
    return { action: 'PROTEGER_PETITS', raison: 'Je protège mes petits contre les prédateurs.' };
  }

  // 4b. SE_REPRODUIRE si partenaire adjacent et pulsion maximale
  if (canReproduce && adjacentReadyMates > 0 && energy > 60 && health > 50) {
    if (Math.random() < 0.85) return { action: 'SE_REPRODUIRE', raison: pickRaison('SE_REPRODUIRE') };
  }

  // 4c. CHERCHER_PARTENAIRE si pulsion haute mais partenaire pas encore adjacent
  if (canReproduce && energy > 55 && health > 50) {
    const prob = nearbyMates > 0 ? 0.70 : 0.40; // plus probable si partenaire en vue
    if (Math.random() < prob) return { action: 'CHERCHER_PARTENAIRE', raison: 'Je pars à la recherche d\'un partenaire.' };
  }

  // Pulsion intermédiaire (60-80) : chercher partenaire parfois
  if (repro_drive >= 60 && !canReproduce && energy > 60) {
    if (Math.random() < 0.25) return { action: 'CHERCHER_PARTENAIRE', raison: 'Ma pulsion reproductive monte, je cherche.' };
  }

  // ===== SOCIAL =====
  if (nearbyAllies > 0 && ['grande_colonie', 'petit_groupe'].includes(social)) {
    if (Math.random() < 0.25) return { action: 'SUIVRE', raison: pickRaison('SUIVRE') };
  }

  // ===== DÉFAUT =====
  const rand = Math.random();
  if (rand < 0.50) return { action: 'EXPLORER', raison: pickRaison('EXPLORER') };
  if (rand < 0.80) return { action: 'SE_DEPLACER', raison: pickRaison('SE_DEPLACER') };
  return { action: 'RIEN', raison: pickRaison('RIEN') };
}

module.exports = { decide };
