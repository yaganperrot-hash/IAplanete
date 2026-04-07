'use strict';
const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync('backend/data/aiplanet.db');
const world = db.prepare("SELECT id, tick FROM worlds WHERE world_type='civilisations' ORDER BY id DESC LIMIT 1").get();
const wid = world.id;

// Structures remarquables
console.log('=== STRUCTURES (top par role) ===');
try {
  var structs = db.prepare(
    "SELECT c.nom as civ, s.name, s.role, s.workers, s.level FROM structures s " +
    "JOIN civilizations c ON c.id=s.civ_id WHERE s.world_id=" + wid +
    " ORDER BY s.level DESC, s.workers DESC LIMIT 40"
  ).all();
  structs.forEach(function(s){ console.log('  ['+s.civ+'] '+s.name+' ('+s.role+') lvl='+s.level+' workers='+s.workers); });
} catch(e) { console.log('  '+e.message); }

// Unknown actions (verbes inventés)
console.log('\n=== VERBES INCONNUS (actions inventées par LLM) ===');
try {
  var unk = db.prepare(
    "SELECT action_type, raw_text, civ_id, tick FROM unknown_actions WHERE world_id=" + wid +
    " ORDER BY tick DESC LIMIT 30"
  ).all();
  if (unk.length === 0) console.log('  (aucun)');
  unk.forEach(function(u){ console.log('  tick='+u.tick+' [civ'+u.civ_id+'] type='+u.action_type+' | '+u.raw_text.substring(0,80)); });
} catch(e) { console.log('  '+e.message); }

// Events diplo détaillés
console.log('\n=== DIPLOMATIE (events détaillés) ===');
var diplo = db.prepare(
  "SELECT tick, description FROM events WHERE world_id=" + wid + " AND type='diplomatie' ORDER BY tick DESC LIMIT 20"
).all();
diplo.forEach(function(e){ console.log('  tick='+e.tick+' '+e.description); });

// Relations diplomatie table
console.log('\n=== RELATIONS ACTIVES ===');
try {
  var rels = db.prepare(
    "SELECT ca.nom as a, cb.nom as b, d.relation FROM diplomacy d " +
    "JOIN civilizations ca ON ca.id=d.civ_a_id JOIN civilizations cb ON cb.id=d.civ_b_id " +
    "WHERE d.world_id=" + wid
  ).all();
  if (rels.length === 0) console.log('  (aucune)');
  rels.forEach(function(r){ console.log('  '+r.a+' <-> '+r.b+' : '+r.relation); });
} catch(e) { console.log('  '+e.message); }

// Reliques
console.log('\n=== RELIQUES ===');
try {
  var relics = db.prepare(
    "SELECT r.name, r.type, r.domain, r.discovered_at_tick, r.taken, r.used, r.bonus_remaining, c.nom as owner " +
    "FROM relics r LEFT JOIN civilizations c ON c.id=r.discovered_by WHERE r.world_id=" + wid +
    " ORDER BY r.discovered_at_tick ASC"
  ).all();
  var onMap = relics.filter(function(r){ return !r.owner; });
  var found = relics.filter(function(r){ return r.owner; });
  console.log('  Sur la carte (non découvertes): ' + onMap.length);
  console.log('  Découvertes: ' + found.length);
  found.forEach(function(r){
    console.log('  tick='+r.discovered_at_tick+' ['+r.owner+'] '+r.name+' ('+r.type+'/'+r.domain+') prise='+r.taken+' utilisée='+r.used+' bonus_restant='+r.bonus_remaining);
  });
} catch(e) { console.log('  '+e.message); }

db.close();
