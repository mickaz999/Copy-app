# Mon espace — clone Notion perso

Next.js + Prisma. Trois espaces :

- **Pages** : arborescence de pages avec éditeur en blocs (raccourcis `# `, `## `, `- `, `[] `, `> `, ` ``` `).
- **Planning** : tâches créa/client/admin/perso en vue calendrier (glisser-déposer pour changer la date) ou tableau (À faire / En cours / Terminé).
- **Compta EI** : livre des recettes et registre des achats, CA encaissé, cotisations URSSAF estimées, suivi du plafond micro, totaux mensuels/trimestriels, export CSV.

## Lancer en local

```bash
npm install
cp .env.example .env   # puis choisis APP_PASSWORD et AUTH_SECRET
npx prisma db push
npm run dev            # http://localhost:3000
```

## Héberger (accès depuis tous tes appareils)

1. Crée une base Postgres gratuite sur neon.tech et copie son URL.
2. Mets cette URL dans `DATABASE_URL` (fichier `.env` en local).
3. Déploie sur Vercel avec les variables `DATABASE_URL`, `APP_PASSWORD`, `AUTH_SECRET`.
4. Les tables sont créées automatiquement à chaque déploiement.

> Les taux URSSAF et plafonds sont réglables dans Compta → ⚙️ Réglages ; vérifie-les sur urssaf.fr, ils changent régulièrement.

<!-- déployé depuis mickaz999/Copy-app -->
