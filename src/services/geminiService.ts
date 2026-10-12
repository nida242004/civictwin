import type { Scenario, AggregateMetrics, PolicyIntervention } from '../types/policy';
import type { CitizenPersona } from '../types/citizen';

/**
 * Generate an executive policy memo and municipal grant proposal via backend proxy
 */
export async function generatePolicyMemo(
  scenario: Scenario,
  activePolicies: PolicyIntervention[],
  baselineMetrics: AggregateMetrics,
  policyMetrics: AggregateMetrics
): Promise<string> {
  const res = await fetch('/api/gemini/memo', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      scenario,
      activePolicies,
      baselineMetrics,
      policyMetrics,
    }),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `Server returned error (${res.status})`);
  }

  const data = await res.json();
  return data.memo;
}

/**
 * Generate a new synthetic citizen persona via backend proxy
 */
export async function generateCustomCitizenWithGemini(
  promptContext: string
): Promise<CitizenPersona> {
  const res = await fetch('/api/gemini/citizen', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt: promptContext }),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `Server returned error (${res.status})`);
  }

  const data = await res.json();
  return data.citizen as CitizenPersona;
}

/**
 * Interactive Q&A with Gemini Policy Consultant via backend proxy
 */
export async function askPolicyConsultant(
  question: string,
  scenario: Scenario,
  policyMetrics: AggregateMetrics
): Promise<string> {
  const res = await fetch('/api/gemini/qa', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question, scenario, policyMetrics }),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `Server returned error (${res.status})`);
  }

  const data = await res.json();
  return data.answer;
}
