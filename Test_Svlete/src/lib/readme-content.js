// ============================================================================
// readme-content.js
// ----------------------------------------------------------------------------
// Centralise the reference content used by the in-app help overlay and the
// repository README. Keeping these snippets here avoids duplicating strings in
// multiple Svelte components and makes future updates simpler.
// ============================================================================

export const readmeLinks = {
  readmeUrl: '/docs/app-readme.html'
};

export const readmeSections = [
  {
    id: 'editor-mode',
    title: 'Mode editeur',
    bullets: [
      'Connexion requise pour creer, mettre a jour ou supprimer un schema',
      'Nommer le schema puis utiliser Enregistrer ou Mettre a jour',
      'Dupliquer pour iterer sur une base existante; Supprimer pour retirer le schema courant',
      'Undo/Redo disponibles tant que la session reste ouverte; Restaurer recupere un brouillon local'
    ]
  },
  {
    id: 'configurator-mode',
    title: 'Mode configurateur',
    bullets: [
      'Consulter les schemas en lecture seule pour verifier le parametrage',
      'Utiliser la liste deroulante pour charger un schema enregistree',
      'Filtrer la recherche par groupe ou gamme pour isoler des noeuds',
      'Exporter en JSON pour partager un schema ou Importer pour tester une version externe'
    ]
  },
  {
    id: 'data-safety',
    title: 'Sauvegardes et brouillons',
    bullets: [
      'Chaque sauvegarde en base ajoute ou met a jour un schema dans SQLite',
      'Un brouillon local est stocke dans localStorage et restaure apres un refresh',
      'Les notifications confirment chaque action (import, export, erreurs API)',
      'Penser a purger les brouillons si un schema devient obsolette'
    ]
  },
  {
    id: 'assistance',
    title: 'Notifications et aide',
    bullets: [
      'Les toasts en haut a droite confirment les actions importantes ou signalent les erreurs',
      'Le bouton ? ouvre un guide selon le mode et permet d acceder au README utilisateur',
      'La barre de recherche accepte noms de noeuds, groupes ou sous-groupes',
      'Les filtres par groupe et gamme reduisent l affichage pour simplifier la navigation'
    ]
  }
];

export const readmeShortcuts = [
  { combo: ['Ctrl', 'Cmd'], key: 'S', note: 'Sauvegarder le schema courant' },
  { combo: ['Ctrl', 'Cmd'], key: 'F', note: 'Focus sur la recherche et ouverture du menu' },
  { combo: [], key: 'Escape', note: 'Fermer menu, formulaire de connexion ou aide' }
];
