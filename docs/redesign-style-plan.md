# Plan de refonte du style (inspiré du « Dashboard V29 »)

Branche cible : `claude/app-style-redesign-l5y46m`
Repo : `mickaz999/copy-app`

## Couleurs : on garde celles de l'app
On ne reprend pas le corail de la maquette. On reprend la forme (mise en page, cartes, sidebar, typo, animations) avec la palette actuelle :
- Accent : orange `#ff6b00`
- Thème clair : fond `#F3EDE4`, cartes `#FAF6F0`, texte `#1C1814`, sidebar `#EAE2D6`
- Thème sombre : fond `#0f0d0c`, cartes `#171513`, texte `#f1ebe4`, sidebar `#161412`
- États : vert `#2f8f5b`, rouge `#e5484d`, jaune `#dfab01`
Partout où la maquette met du corail, on met l'orange de l'app.

## Le style visé
- Fond gris très clair, cartes blanches arrondies (rayon de 16 à 20 px), ombres très légères
- Couleur d'accent corail / rouge-saumon : cartes mises en avant, progression, bouton d'envoi, élément actif
- Mélange de cartes blanches, de cartes en dégradé corail et de quelques cartes noires
- Sidebar en colonne noire étroite, icônes seules, pastille corail sur la page active
- Barre du haut : date en petit, titre de page, recherche en pilule avec ⌘K, boutons ronds, avatar
- Typo sans-serif moderne, grands titres légers, gros chiffres (ex. « $319K »)
- Filtres en pilules avec compteurs, badges, avatars empilés, pilule noire pour l'élément actif
- Animations douces : cartes qui remontent au survol, transitions de page (framer-motion si React)
- Option : mode sombre, fond presque noir avec un halo rouge

## Méthode
1. Analyser le repo choisi (framework, système de styles)
2. Définir les variables de design une seule fois : couleurs, rayons, ombres, typo, espacements
3. Refaire une page pilote et la faire valider
4. Appliquer à tous les composants (boutons, champs, cartes, listes, modales), puis à toutes les pages
5. Commit, push, PR en brouillon

Recopier uniquement l'esthétique, pas les contenus de la maquette.
