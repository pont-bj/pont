export const AGENTS_MARKER_START = "<!-- pont:start -->";
export const AGENTS_MARKER_END = "<!-- pont:end -->";

/** Section ajoutée à `AGENTS.md` : consignes pour un agent IA (Claude Code, Cursor…) qui intègre Pont. */
export function agentsSection(stack: string): string {
  return `${AGENTS_MARKER_START}
## Paiements : Pont

Ce projet encaisse via **Pont** (\`@pont/node\`), orchestrateur des agrégateurs africains (FedaPay, PawaPay, PayDunya, Kkiapay).
Stack détectée : ${stack}.

Règles non négociables :
1. **Montant côté serveur uniquement.** \`pont.createPayment\` n'est appelé que depuis le serveur (Server Action, route API). Le navigateur ne transmet jamais de montant.
2. **Clé d'idempotence** sur chaque création (\`createPayment\`, \`createPayout\`, \`createRefund\`) : une valeur stable par intention de paiement.
3. **Ne jamais livrer une commande sur la base de l'URL de retour** ni du contenu d'un webhook : se fier à \`payment.status === "succeeded"\` (Pont l'a vérifié auprès de l'agrégateur) ou à l'événement \`payment.succeeded\`.
4. **Webhooks agrégateurs** : la route \`/api/pont/hooks/[provider]\` lit le corps brut ; ne pas ajouter de parsing avant.
5. **Secrets** : uniquement dans \`.env.local\` / variables d'environnement. Jamais de préfixe \`NEXT_PUBLIC_\` sur une clé d'agrégateur.
6. Montants en **entiers** (XOF/XAF sans décimales).

Tester sans compte agrégateur : \`PONT_SANDBOX=true\`, numéros magiques \`+2290100000001\` (succès), \`…0000002\` (solde insuffisant), \`…0000003\` (jamais confirmé), \`…0000007\` (timeout ambigu), \`…0000008\` (refus).

Commandes :
- \`npx pont trigger success\` : simule un paiement réussi.
- \`npx pont doctor\` : audit de sécurité de l'intégration ; doit être vert avant le live.
${AGENTS_MARKER_END}
`;
}
