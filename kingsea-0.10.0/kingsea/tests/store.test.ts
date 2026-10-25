// Fiches des boutiques et textes légaux : limites de caractères des boutiques, cohérence avec le jeu.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { LEGAL, PRIVACY, TERMS, legalText } from '../src/legal/texts';

const listing = JSON.parse(readFileSync('store/listing.json', 'utf8'));

test('fiches : limites des boutiques respectées (App Store et Google Play)', () => {
  for (const lang of ['fr-FR', 'en-US']) {
    const l = listing[lang];
    const len = (s: string) => [...s].length;
    assert.ok(len(l.name) <= 30, `${lang} nom`);
    assert.ok(len(l.subtitle) <= 30, `${lang} sous-titre (${len(l.subtitle)})`);
    assert.ok(len(l.promotionalText) <= 170, `${lang} texte promotionnel (${len(l.promotionalText)})`);
    assert.ok(Buffer.byteLength(l.keywords) <= 100, `${lang} mots-clés (${Buffer.byteLength(l.keywords)} octets)`);
    assert.ok(len(l.shortDescription) <= 80, `${lang} description courte (${len(l.shortDescription)})`);
    assert.ok(len(l.description) <= 4000, `${lang} description`);
    assert.ok(len(l.releaseNotes) <= 500, `${lang} nouveautés`);
    assert.match(l.description, /18/, 'âge indiqué');
    assert.ok(!/gagne[rz]? de l.argent|real money prizes|cash out/i.test(l.description), 'aucune promesse de gain réel');
  }
});

test('fiche cohérente avec le jeu : pas de pub, pas d’achat, nombre de mini-jeux', () => {
  assert.equal(listing.meta.ads, false);
  assert.equal(listing.meta.inAppPurchases, false);
  assert.match(listing['fr-FR'].releaseNotes, /25 mini-jeux/);
});

test('textes légaux : suppression du compte, droits, âge, aucune valeur réelle', () => {
  const p = legalText(PRIVACY), t = legalText(TERMS);
  assert.match(p, /Supprimer mon compte/);
  assert.match(p, /delete-account/);
  assert.match(p, /CNIL/);
  assert.match(p, /jamais enregistrée/, 'adresse IP non conservée (conforme au serveur)');
  assert.match(t, new RegExp(`${LEGAL.minAge} ans`));
  assert.match(t, /aucune valeur/);
  assert.equal(LEGAL.minAge, 18);
});
