import { MAGIC_NUMBERS } from "@pont-bj/sandbox";
import { createPontFromEnv, type PontEvent } from "@pont-bj/node";

const SCENARIOS = Object.fromEntries(Object.entries(MAGIC_NUMBERS).map(([suffix, name]) => [name, `+229010${suffix}`])) as Record<string, string>;

export const SCENARIO_NAMES = Object.keys(SCENARIOS);

/**
 * Rejoue un scénario du sandbox en local et affiche les événements produits, comme les recevrait l'application.
 * Exemple : `pont trigger insufficient_funds`.
 */
export async function runTrigger(scenario: string, log: (line: string) => void): Promise<PontEvent[]> {
  const phone = SCENARIOS[scenario];
  if (!phone) throw new Error(`Scénario inconnu : ${scenario}. Disponibles : ${SCENARIO_NAMES.join(", ")}`);
  const events: PontEvent[] = [];
  const pont = createPontFromEnv({
    env: { PONT_SANDBOX: "true", PONT_PUBLIC_URL: "http://localhost:3000" },
    onEvent: (event) => {
      events.push(event);
      log(`→ ${event.type}  ${event.data.id}${"failureCode" in event.data && event.data.failureCode ? `  (${event.data.failureCode})` : ""}`);
    },
  });
  let payment;
  try {
    payment = await pont.createPayment(
      { amount: 5000, currency: "XOF", country: "BJ", customer: { phone }, reference: `trigger-${scenario}` },
      `trigger-${scenario}-${Date.now()}`,
    );
  } catch (error) {
    log(`→ création refusée : ${error instanceof Error ? error.message : String(error)}`);
    return events;
  }
  await pont.refreshPayment(payment.id);
  return events;
}
