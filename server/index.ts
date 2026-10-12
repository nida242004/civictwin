// Backend proxy server for Gemini API - API Key NEVER touches client bundle!

const API_KEY = process.env.GEMINI_API_KEY || '';
const PORT = 3001;

// Multi-tier model failover chain for maximum resilience against 503 high-demand spikes
const CANDIDATE_MODELS = [
  'gemini-3.8-flash',
  'gemini-3.5-flash',
  'gemini-3-flash-preview',
  'gemini-2.5-flash',
];

async function callGoogleGemini(
  prompt: string,
  systemInstruction?: string
): Promise<{ text: string; modelUsed: string }> {
  if (!API_KEY) {
    throw new Error('GEMINI_API_KEY is not set on the server.');
  }

  let lastError: Error | null = null;

  for (const model of CANDIDATE_MODELS) {
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${API_KEY}`;
        const payload: any = {
          contents: [{ parts: [{ text: prompt }] }],
        };

        if (systemInstruction) {
          payload.systemInstruction = { parts: [{ text: systemInstruction }] };
        }

        const resp = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

        if (!resp.ok) {
          const errText = await resp.text();
          // 503 = Service Unavailable (High Demand), 429 = Rate limit
          if ((resp.status === 503 || resp.status === 429) && attempt === 1) {
            console.warn(`[Gemini Proxy] ${model} attempt 1 returned ${resp.status} (High Demand). Retrying in 600ms...`);
            await new Promise((r) => setTimeout(r, 600));
            continue;
          }
          throw new Error(`Google API returned ${resp.status} on ${model}: ${errText}`);
        }

        const data = await resp.json();
        const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!text) {
          throw new Error(`Empty response from ${model}`);
        }

        console.log(`[Gemini Proxy] Successfully answered via ${model}`);
        return { text: text.trim(), modelUsed: model };
      } catch (err: any) {
        lastError = err;
        console.warn(`[Gemini Proxy] Model ${model} encountered error: ${err.message}. Seamlessly attempting next model in failover chain...`);
        break; // break retry loop, move to next model in CANDIDATE_MODELS
      }
    }
  }

  throw lastError || new Error('All candidate Gemini models temporarily unavailable.');
}

const server = Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);

    // CORS Headers for safety
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };

    if (req.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    // Health check
    if (url.pathname === '/api/health') {
      return Response.json(
        {
          status: 'ok',
          geminiReady: !!API_KEY,
          primaryModel: CANDIDATE_MODELS[0],
          failoverChain: CANDIDATE_MODELS,
        },
        { headers: corsHeaders }
      );
    }

    // Generate Policy Memo
    if (url.pathname === '/api/gemini/memo' && req.method === 'POST') {
      try {
        const body = await req.json();
        const { scenario, activePolicies, baselineMetrics, policyMetrics } = body;

        const systemInstruction = `You are an expert Chief Urban Planner and Municipal Policy Analyst presenting an executive digital twin simulation debrief to the City Council. 
Write in crisp, persuasive, professional, and empathetic prose with structured markdown headers. Highlight concrete numbers and real human impact.`;

        const prompt = `
Neighborhood: ${scenario?.title || 'Urban District'}
Baseline Situation:
- Perceived Safety Index: ${baselineMetrics?.perceivedSafetyIndex}/100
- Avg Night Commute: ${baselineMetrics?.avgCommuteMinutes} min
- Fear Incidents: ${baselineMetrics?.darkCorridorFearIncidents}
- Vulnerable Equity: ${baselineMetrics?.vulnerableEquityScore}%

Proposed Policy Interventions:
${(activePolicies || []).map((p: any) => `- ${p.name} ($${p.capex?.toLocaleString()} CapEx, $${p.monthlyOpex}/mo OpEx)`).join('\n')}

Simulated Outcomes with Policy:
- Perceived Safety Index: ${policyMetrics?.perceivedSafetyIndex}/100 (+${(policyMetrics?.perceivedSafetyIndex || 0) - (baselineMetrics?.perceivedSafetyIndex || 0)}%)
- Avg Night Commute: ${policyMetrics?.avgCommuteMinutes} min (-${Math.round(((baselineMetrics?.avgCommuteMinutes || 0) - (policyMetrics?.avgCommuteMinutes || 0)) * 10) / 10} min faster)
- Fear Incidents Dropped to: ${policyMetrics?.darkCorridorFearIncidents}
- Vulnerable Equity: ${policyMetrics?.vulnerableEquityScore}% (+${(policyMetrics?.vulnerableEquityScore || 0) - (baselineMetrics?.vulnerableEquityScore || 0)}%)
- Total Investment: $${policyMetrics?.totalCapEx?.toLocaleString()} Upfront, $${policyMetrics?.monthlyOpex?.toLocaleString()}/mo ongoing

Please generate:
1. Executive Summary & Core Policy Recommendation
2. Human & Equity Impact (focusing on late-shift healthcare workers, seniors, and students)
3. Unintended Consequences & Risk Mitigation Plan
4. Return on Civic Investment (ROCI) Conclusion for Council Approval
`;

        const { text: memo, modelUsed } = await callGoogleGemini(prompt, systemInstruction);
        return Response.json({ memo, modelUsed }, { headers: corsHeaders });
      } catch (err: any) {
        return Response.json({ error: err.message }, { status: 500, headers: corsHeaders });
      }
    }

    // Generate Synthetic Citizen Persona
    if (url.pathname === '/api/gemini/citizen' && req.method === 'POST') {
      try {
        const body = await req.json();
        const promptContext = body?.prompt || 'A late night resident or shift worker';

        const systemInstruction = `You are a sociological demographic simulator. Generate a realistic citizen persona in valid JSON matching this TypeScript interface:
{
  "name": string,
  "age": number,
  "gender": "Female" | "Male" | "Non-Binary",
  "role": string,
  "avatar": emoji string,
  "incomeTier": "Low" | "Medium" | "High",
  "mobility": "STANDARD" | "WHEELCHAIR" | "CANE_SENIOR" | "STROLLER_PARENT" | "STUDENT",
  "speed": number (between 2.0 and 4.5),
  "safetySensitivity": number (0.0 to 1.0),
  "transitDependency": number (0.0 to 1.0),
  "needsRestroom": boolean,
  "origin": { "x": number (between 1 and 14), "y": number (between 1 and 14) },
  "destination": { "x": number (between 1 and 14), "y": number (between 1 and 14) },
  "originName": string,
  "destinationName": string,
  "departureTime": number (e.g. 23.5 for 23:30),
  "purpose": string,
  "voiceQuote": string
}
Return ONLY valid raw JSON without markdown backticks or commentary.`;

        const prompt = `Generate a unique citizen persona for a neighborhood simulation: ${promptContext}`;
        const { text: rawJson, modelUsed } = await callGoogleGemini(prompt, systemInstruction);
        const cleanJson = rawJson.replace(/```json\n?|\n?```/g, '').trim();
        const citizen = JSON.parse(cleanJson);
        citizen.id = `c-gemini-${Date.now()}`;

        return Response.json({ citizen, modelUsed }, { headers: corsHeaders });
      } catch (err: any) {
        return Response.json({ error: err.message }, { status: 500, headers: corsHeaders });
      }
    }

    // Ask Urban Consultant
    if (url.pathname === '/api/gemini/qa' && req.method === 'POST') {
      try {
        const body = await req.json();
        const { question, scenario, policyMetrics } = body;

        const systemInstruction = `You are an AI Urban Policy Consultant advising a user inside the CivicTwin digital twin app. Answer concisely in 2-3 paragraphs with actionable urban design wisdom.`;

        const prompt = `
Neighborhood: ${scenario?.title || 'Urban District'}
Current Metrics:
- Safety: ${policyMetrics?.perceivedSafetyIndex}/100
- Commute Time: ${policyMetrics?.avgCommuteMinutes} min
- Vulnerable Equity: ${policyMetrics?.vulnerableEquityScore}%
- CapEx: $${policyMetrics?.totalCapEx}

User Question: "${question}"
`;

        const { text: answer, modelUsed } = await callGoogleGemini(prompt, systemInstruction);
        return Response.json({ answer, modelUsed }, { headers: corsHeaders });
      } catch (err: any) {
        return Response.json({ error: err.message }, { status: 500, headers: corsHeaders });
      }
    }

    return new Response('Not Found', { status: 404, headers: corsHeaders });
  },
});

console.log(`[CivicTwin Backend] Server running on http://localhost:${PORT}`);
