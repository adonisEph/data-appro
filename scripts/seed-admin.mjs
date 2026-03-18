#!/usr/bin/env node
// ============================================================
// Script de création du premier compte Responsable
// Usage : node scripts/seed-admin.mjs
// ============================================================

import { createHash } from 'crypto';
import { execSync } from 'child_process';
import readline from 'readline';

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = q => new Promise(res => rl.question(q, res));

async function main() {
  console.log('\n🔐 Création du premier compte Responsable Data Appro\n');

  const nom       = await ask('Nom        : ');
  const prenom    = await ask('Prénom     : ');
  const telephone = await ask('Téléphone  : ');
  const email     = await ask('Email      : ');
  const password  = await ask('Mot de passe : ');
  const env       = await ask('Environnement [local/prod] (défaut: local) : ') || 'local';

  rl.close();

  const isLocal = env !== 'prod';

  // On génère le hash APRES avoir l'ID = 1 (premier insert)
  // Le hash = SHA256(password + responsable_id)
  // Pour le premier compte, on précompute avec id=1
  const tempHash = createHash('sha256').update(password + '1').digest('base64');

  const agentSQL = `INSERT INTO agents (nom, prenom, telephone, role, quota_gb) VALUES ('${nom}', '${prenom}', '${telephone.replace(/\s/g,'')}', 'manager', 45);`;
  const respSQL  = `INSERT INTO responsables (agent_id, email, password_hash) VALUES (1, '${email}', '${tempHash}');`;

  const flag = isLocal ? '--local' : '';
  const db = 'data-appro-db';

  console.log('\n📋 Exécution des requêtes SQL...\n');

  try {
    execSync(`npx wrangler d1 execute ${db} ${flag} --command="${agentSQL}"`, { stdio: 'inherit' });
    execSync(`npx wrangler d1 execute ${db} ${flag} --command="${respSQL}"`, { stdio: 'inherit' });

    console.log('\n✅ Compte créé avec succès !');
    console.log(`   Email    : ${email}`);
    console.log(`   Env      : ${isLocal ? 'Local (D1 local)' : 'Production (D1 Cloudflare)'}`);
    console.log('\n💡 Si le compte responsable n\'est pas le premier agent (id≠1),');
    console.log('   mettre à jour le password_hash manuellement avec id correct.\n');
  } catch (err) {
    console.error('\n❌ Erreur :', err.message);
    console.log('\n📝 SQL à exécuter manuellement :');
    console.log(agentSQL);
    console.log(respSQL);
  }
}

main();
