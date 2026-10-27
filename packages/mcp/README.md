# @pont/mcp

Serveur MCP qui permet à un agent IA (Claude Code, Cursor, Windsurf) d'intégrer les paiements Pont dans un projet.
**Sandbox uniquement** : aucun outil n'effectue d'opération financière réelle.

## Installation

```bash
# Claude Code
claude mcp add pont -- npx -y @pont/mcp

# Cursor / Windsurf (mcp.json)
{ "mcpServers": { "pont": { "command": "npx", "args": ["-y", "@pont/mcp"] } } }
```

Puis demandez à l'agent : *« Ajoute le paiement mobile money au checkout »*.

## Outils

| Outil | Rôle |
|---|---|
| `detect_stack` | Framework, TypeScript, gestionnaire de paquets, génération possible ou non |
| `scaffold_integration` | Prévisualise (`apply=false`) puis écrit l'intégration ; n'écrase jamais rien |
| `get_coverage` | Qui couvre quel pays / opérateur, en dépôt, retrait, remboursement |
| `create_test_payment` | Paiement complet dans le sandbox selon un scénario |
| `simulate_webhook` | Webhooks Pont signés d'un scénario, envoyés à `localhost` si demandé |
| `explain_error` | Signification et correctif d'un code d'erreur |
| `run_doctor` | Audit de sécurité de l'intégration |
| `search_docs` | Recherche dans la documentation |

Ressources : `pont://docs/{quickstart, sandbox, securite, webhooks, retraits-remboursements, stockage, variables}`.

## Garde-fous

- Chemins de projet absolus et existants uniquement.
- `simulate_webhook` n'envoie que vers `localhost`.
- Aucun outil ne lit ni ne demande de clé d'agrégateur.
