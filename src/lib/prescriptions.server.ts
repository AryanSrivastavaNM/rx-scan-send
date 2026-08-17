export type ExtractedMedicine = {
  name: string;
  /** The single dosage/strength figure for this medicine — a plain numeric
   * value, see strengthUnit for the unit. For a tablet/capsule this is
   * usually the medicine's own potency (e.g. "625" in "Augmentin 625"); for
   * a liquid/syrup/drops/inhaler it's the amount given per dose (e.g. the
   * "5" in "5 ml BD"). There is only one such figure per medicine — the
   * distinction between "strength" and "administered dose" is handled
   * internally by the extraction/normalization logic below and never
   * surfaces as two separate fields here. */
  strength: string | null;
  /** One of: mg, ml, g, mcg, IU, drops, puffs — or null if not confidently readable. */
  strengthUnit: string | null;
  /** One of: Once daily, Twice daily, Thrice daily, Every 4 hrs, Every 6 hrs, Every 8 hrs, SOS.
   * For the Qwen/image path this is computed deterministically in code from
   * the model's literal `dosageInstruction` transcription (e.g. "1-0-1"),
   * not asked of the model directly — see normalizeQwenMedicine(). */
  frequency: string | null;
  /** Which of exactly three fixed time-of-day slots ("Morning", "Afternoon",
   * "Night" — never "Evening") this dose applies to, purely for display
   * (see the Schedule chips in MedicineCard, home.tsx). Only populated when
   * the original shorthand was one of the seven explicit digit patterns
   * (e.g. "1-0-1"); empty for word abbreviations like "BD"/"SOS"/"Every 4
   * hrs", where the specific times aren't determinable without guessing.
   * Purely additive/derived from the same dosageInstruction frequency
   * itself is computed from — does not change frequency in any way. */
  scheduleSlots: string[];
  /** One of: Before food, After food, With food, Empty stomach, Bedtime, Anytime. */
  timing: string | null;
  /** Numeric duration value only, e.g. "30" — see durationUnit for the unit.
   * For the Qwen/image path this is computed deterministically in code from
   * the model's literal `durationText` transcription (e.g. "30 days"), not
   * asked of the model directly — see normalizeQwenMedicine(). */
  duration: string | null;
  /** One of: Days, Weeks, Months. */
  durationUnit: string | null;
  quantity: string | null;
};

export type ExtractedPrescription = {
  patientName: string | null;
  doctorName: string | null;
  prescriptionDate: string | null;
  notes: string | null;
  medicines: ExtractedMedicine[];
};

// Still used by the PDF branch (extractPdfWithLovable) — unchanged.
const SYSTEM_PROMPT = `You read medical prescriptions and return structured data.
Extract every prescribed medicine with strength, form, dosage schedule, duration and quantity when present.
Never invent medicines. If a field is unreadable, return null for it.
Respond ONLY with JSON of the shape:
{"patientName":string|null,"doctorName":string|null,"prescriptionDate":string|null,"notes":string|null,
"medicines":[{"name":string,"strength":string|null,"form":string|null,"dosage":string|null,"duration":string|null,"quantity":string|null,"instructions":string|null}]}`;

// Used by the image branch (extractImageWithQwen) only. Asks Qwen for a
// literal transcription (dosageInstruction/durationText), NOT a normalized
// frequency/duration — the model was unreliable at doing that
// categorization itself (it would often leave frequency/duration blank even
// when the shorthand was clearly legible). normalizeQwenMedicine() below
// does that normalization deterministically in code instead, from the
// literal text this prompt asks for.
const QWEN_SYSTEM_PROMPT = `You read medical prescriptions and return structured data.

For each medicine, extract and normalize these fields:
- name: the medicine name, as written.
- strength: the single dosage/strength figure for this medicine, as a plain number (e.g. "40" from "Pantop 40", "625" from "Augmentin 625", "5" from "5 ml") — never include the unit here, and never report more than one figure. This is whichever quantity a patient/pharmacist would read as "how much of this medicine": for a tablet/capsule it's usually the medicine's own potency; for a liquid/syrup/drops/inhaler it's the amount given per dose (e.g. the "5" in "5 ml BD" — that "5" IS the strength value to report, not a separate thing).
- strengthUnit: exactly one of "mg", "ml", "g", "mcg", "IU", "drops", "puffs" — or null if the unit isn't confidently readable. Never assume a unit that isn't visibly present.

Do NOT confuse dosage FORM with strength UNIT. Words like "Tab.", "Tablet", "Cap.", "Capsule", "Syrup", "Inj." describe what kind of medicine it is, not its strength — never use them as strengthUnit. In particular, "tabs" is never a valid strengthUnit: "Tab. Dolo 650" means the form is a tablet and the strength is 650, not "650 tabs". A number written with the medicine name (with or without a form word before it, e.g. "Dolo 650", "Azithral 500") is the strength value.

If a unit is explicitly visible — including in a dosing instruction like "5 ml BD", where "ml" is right there — use it. Otherwise, only set strengthUnit to "mg" when the medicine name + strength number together are an unambiguous, universally-standard combination (e.g. "Dolo 650" is paracetamol 650mg and nothing else — there is no other common strength/product this could be) — this is a narrow exception, not a default for tablets/capsules in general. For every other case where no unit is visible — including when you merely suspect mg is likely, or the name/strength pairing isn't a combination you're certain has exactly one standard meaning — leave strengthUnit null and let the user pick it themselves. If you can't confidently place a form word into any field above, it's fine to note it in "notes" instead of forcing it somewhere it doesn't belong.
- dosageInstruction: the literal dosing instruction exactly as it appears on the prescription — transcribe it, do not interpret, categorize or normalize it yourself (e.g. "1-0-1", "0-1-0", "1-1-1", "SOS", "BD", "5 ml BD"). Normalizing this into a frequency happens separately, deterministically, in code afterward — your only job for this field is an accurate literal transcription of whatever dosing notation is written. If nothing legible is written, return null.
- timing: normalize the food/timing instruction into exactly one of "Before food", "After food", "With food", "Empty stomach", "Bedtime", "Anytime":
  - "B/F", "BF", "before food", "before meals" -> "Before food"
  - "A/F", "AF", "after food", "after meals" -> "After food"
  - "with food" -> "With food"; "empty stomach" -> "Empty stomach"; "bedtime"/"night" -> "Bedtime"; "anytime" -> "Anytime"
  - A reason/condition for an SOS dose (e.g. "if fever/pain") is not one of these values — leave timing null unless one of the values above is also separately, visibly present.
- durationText: the literal duration exactly as it appears on the prescription — transcribe it, do not split it into a number and a unit yourself (e.g. "30 days", "15 days", "x 5 days", "2 weeks"). Splitting this into duration/durationUnit happens separately, deterministically, in code afterward. If nothing legible is written, return null.
- quantity: the prescribed quantity, as written, or null.

MOST IMPORTANT RULE: never guess or invent a value that isn't visibly present — transcribe exactly what's on the prescription for dosageInstruction and durationText, do not paraphrase or complete a pattern you merely suspect. Return null only for a field that is genuinely unreadable or absent, and only for that specific field, not the whole medicine (a medicine's name may be clear while its duration is illegible; return the name and null durationText). Never invent medicines. Never infer a value just because it's typical for that medicine or drug class, even if you're fairly confident.

Respond ONLY with JSON of the shape:
{"patientName":string|null,"doctorName":string|null,"prescriptionDate":string|null,"notes":string|null,
"medicines":[{"name":string,"strength":string|null,"strengthUnit":string|null,"dosageInstruction":string|null,"timing":string|null,"durationText":string|null,"quantity":string|null}]}`;

// "tabs" deliberately excluded — see the strengthUnit note in
// QWEN_SYSTEM_PROMPT above (dosage FORM, e.g. "Tab.", is not a strength
// unit). It's a valid *dose* unit instead — see ALLOWED_DOSE_UNIT.
const ALLOWED_STRENGTH_UNIT = ["mg", "ml", "g", "mcg", "IU", "drops", "puffs"] as const;
const ALLOWED_FREQUENCY = [
  "Once daily",
  "Twice daily",
  "Thrice daily",
  "Every 4 hrs",
  "Every 6 hrs",
  "Every 8 hrs",
  "SOS",
] as const;
const ALLOWED_TIMING = [
  "Before food",
  "After food",
  "With food",
  "Empty stomach",
  "Bedtime",
  "Anytime",
] as const;
const ALLOWED_DURATION_UNIT = ["Days", "Weeks", "Months"] as const;

/** Raw shorthand -> canonical ALLOWED_FREQUENCY value. Keys are the bare
 * token matched by FREQUENCY_PATTERN below (see matchFrequencyShorthand). */
const FREQUENCY_SHORTHAND: Record<string, string> = {
  "1-0-0": "Once daily",
  "0-0-1": "Once daily",
  "0-1-0": "Once daily",
  od: "Once daily",
  "1-1-0": "Twice daily",
  "1-0-1": "Twice daily",
  "0-1-1": "Twice daily",
  bd: "Twice daily",
  bid: "Twice daily",
  "1-1-1": "Thrice daily",
  tds: "Thrice daily",
  tid: "Thrice daily",
  sos: "SOS",
};

/** Matches a dosing pattern ("1-0-1") or an abbreviation (BD/BID/TDS/TID/OD/SOS)
 * as a standalone token anywhere in a longer string, not just an exact
 * full-string match. */
const FREQUENCY_PATTERN = /[01]-[01]-[01]|\b(?:bid|bd|tid|tds|od|sos)\b/i;

function matchFrequencyShorthand(text: string): string | null {
  const match = text.match(FREQUENCY_PATTERN);
  return match ? (FREQUENCY_SHORTHAND[match[0].toLowerCase()] ?? null) : null;
}

/** Digit-pattern shorthand -> which of the three fixed time-of-day slots it
 * covers — purely a UI/display concern (see the Schedule chips in
 * MedicineCard, home.tsx). Only the three explicit digit patterns below are
 * deterministically resolvable to specific slots; word abbreviations like
 * "BD"/"TDS"/"SOS" say HOW OFTEN but not WHICH times, so they intentionally
 * have no entry here — matchScheduleSlots() returns [] for those rather
 * than guessing which slots were meant. Reuses the exact same digit-pattern
 * half of FREQUENCY_PATTERN; does not change frequency normalization at
 * all. There is no "Evening" slot — only Morning, Afternoon, Night. */
const DOSAGE_PATTERN_SLOTS: Record<string, readonly string[]> = {
  "1-0-0": ["Morning"],
  "0-1-0": ["Afternoon"],
  "0-0-1": ["Night"],
  "1-1-0": ["Morning", "Afternoon"],
  "1-0-1": ["Morning", "Night"],
  "0-1-1": ["Afternoon", "Night"],
  "1-1-1": ["Morning", "Afternoon", "Night"],
};

function matchScheduleSlots(text: string): string[] {
  const match = text.match(/[01]-[01]-[01]/);
  return match ? [...(DOSAGE_PATTERN_SLOTS[match[0]] ?? [])] : [];
}

/** Matches a duration unit word ("days", "wk", "months", ...) as a
 * standalone token, independent of whether a number is next to it. */
const DURATION_UNIT_PATTERN = /\b(days?|d)\b|\b(weeks?|wks?)\b|\b(months?|mos?)\b/i;

function matchDurationUnitWord(text: string): string | null {
  const match = text.match(DURATION_UNIT_PATTERN);
  if (!match) return null;
  if (match[1]) return "Days";
  if (match[2]) return "Weeks";
  return "Months";
}

/** Recovers a "<number> <unit>" pair from free text, e.g. "30 days" ->
 * {value:"30", unit:"Days"} — used to catch the model returning a whole
 * duration phrase in a single field instead of splitting it. */
const DURATION_PHRASE_PATTERN =
  /(\d+(?:\.\d+)?)\s*(?:(days?|d)\b|(weeks?|wks?)\b|(months?|mos?)\b)/i;

function matchDurationPhrase(text: string): { value: string | null; unit: string | null } {
  const match = text.match(DURATION_PHRASE_PATTERN);
  if (!match) return { value: null, unit: null };
  const unit = match[2] ? "Days" : match[3] ? "Weeks" : match[4] ? "Months" : null;
  return { value: match[1] ?? null, unit };
}

function normalizeString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/** Only ever returns a value from `allowed` (case-insensitively matched) or
 * null — a value the model got wrong (wrong casing, a synonym, free text
 * where an enum was asked for) becomes null instead of silently reaching the
 * medicine-entry dropdowns as an option they don't have. */
function normalizeEnum(value: unknown, allowed: readonly string[]): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return allowed.find((a) => a.toLowerCase() === trimmed.toLowerCase()) ?? null;
}

/** Strips stray commas/whitespace and keeps only a leading numeric value —
 * e.g. "60,000" -> "60000", "40mg" -> "40" (defends against the model
 * including a unit here despite being asked not to). */
function extractNumeric(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const match = value.replace(/,/g, "").match(/\d+(?:\.\d+)?/);
  return match ? match[0] : null;
}

/** Frequency is computed deterministically from the model's literal
 * `dosageInstruction` transcription (see QWEN_SYSTEM_PROMPT) rather than
 * trusting the model to categorize it itself — that's what was unreliable.
 * Checks, in order: (1) dosageInstruction is already a canonical value
 * (covers a prescription that's literally handwritten in words, e.g. "Once
 * daily"), (2) it contains a raw shorthand token (see
 * FREQUENCY_SHORTHAND/FREQUENCY_PATTERN above) embedded anywhere in it. */
function normalizeFrequencyValue(dosageInstruction: unknown): string | null {
  if (typeof dosageInstruction !== "string") return null;
  const exact = normalizeEnum(dosageInstruction, ALLOWED_FREQUENCY);
  if (exact) return exact;
  return matchFrequencyShorthand(dosageInstruction);
}

/** Duration is computed deterministically from the model's literal
 * `durationText` transcription (see QWEN_SYSTEM_PROMPT), mirroring
 * normalizeFrequencyValue. Prefers a coherent "<number> <unit>" pair found
 * together in the text; failing that, still recovers a bare number or a
 * bare unit word independently rather than giving up entirely on a
 * partially-legible phrase. */
function normalizeDurationText(durationText: unknown): {
  duration: string | null;
  durationUnit: string | null;
} {
  if (typeof durationText !== "string" || !durationText.trim()) {
    return { duration: null, durationUnit: null };
  }
  const phrase = matchDurationPhrase(durationText);
  if (phrase.value && phrase.unit) return { duration: phrase.value, durationUnit: phrase.unit };
  return {
    duration: extractNumeric(durationText),
    durationUnit: matchDurationUnitWord(durationText),
  };
}

/** Low-level parsing shared by both providers below — both are
 * OpenAI-chat-completions-shaped responses, so pulling the JSON text out of
 * `choices[0].message.content` and fence-stripping it is identical either
 * way. Returns the raw, untrusted parsed object — each provider below maps
 * it into ExtractedPrescription/ExtractedMedicine differently, since Qwen
 * and Lovable/Gemini are asked for different raw shapes (see
 * QWEN_SYSTEM_PROMPT vs SYSTEM_PROMPT). */
async function parseChatCompletionJson(res: Response): Promise<Record<string, unknown>> {
  const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const text = json.choices?.[0]?.message?.content ?? "";
  const cleaned = text
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/, "")
    .trim();

  try {
    return JSON.parse(cleaned) as Record<string, unknown>;
  } catch {
    throw new Error("The prescription could not be read. Try a clearer photo.");
  }
}

/** Qwen's raw per-medicine shape is name/strength/strengthUnit/
 * dosageInstruction/timing/durationText/quantity (see QWEN_SYSTEM_PROMPT) —
 * frequency and duration/durationUnit are DERIVED here deterministically
 * from the literal dosageInstruction/durationText transcriptions, not read
 * directly off the model's output, since asking the model to categorize
 * them itself was unreliable (it would often leave them blank even on
 * legible shorthand). */
function normalizeQwenMedicine(m: Record<string, unknown>): ExtractedMedicine | null {
  const name = normalizeString(m["name"]);
  if (!name) return null;

  const { duration, durationUnit } = normalizeDurationText(m["durationText"]);
  const dosageInstruction = m["dosageInstruction"];

  return {
    name,
    strength: extractNumeric(m["strength"]),
    strengthUnit: normalizeEnum(m["strengthUnit"], ALLOWED_STRENGTH_UNIT),
    frequency: normalizeFrequencyValue(dosageInstruction),
    scheduleSlots:
      typeof dosageInstruction === "string" ? matchScheduleSlots(dosageInstruction) : [],
    timing: normalizeEnum(m["timing"], ALLOWED_TIMING),
    duration,
    durationUnit,
    quantity: normalizeString(m["quantity"]),
  };
}

async function parseQwenExtraction(res: Response): Promise<ExtractedPrescription> {
  const parsed = await parseChatCompletionJson(res);
  const rawMedicines = parsed["medicines"];
  const medicines = Array.isArray(rawMedicines)
    ? rawMedicines
        .map((m) =>
          m && typeof m === "object" ? normalizeQwenMedicine(m as Record<string, unknown>) : null,
        )
        .filter((m): m is ExtractedMedicine => m !== null)
        .slice(0, 40)
    : [];

  return {
    patientName: normalizeString(parsed["patientName"]),
    doctorName: normalizeString(parsed["doctorName"]),
    prescriptionDate: normalizeString(parsed["prescriptionDate"]),
    notes: normalizeString(parsed["notes"]),
    medicines,
  } satisfies ExtractedPrescription;
}

/** Lovable/Gemini's prompt (SYSTEM_PROMPT, unchanged — see extractPdfWithLovable)
 * still asks for the old flat shape (strength/form/dosage/duration/quantity/instructions),
 * not the new structured fields, since that prompt/provider isn't being
 * touched here. This adapts its output into the ExtractedMedicine shape as
 * best-effort free text — strengthUnit/frequency/timing/durationUnit are
 * left null for PDF extractions (Lovable's prompt was never asked to
 * produce them), and the user fills those in manually in the confirmation
 * UI. `form`/`instructions` have no field to land in now that per-medicine
 * notes has been removed from ExtractedMedicine — that free-text info is
 * simply not carried over for PDFs, a known side effect of dropping the
 * field rather than an active change to this branch's own prompt/logic. */
function normalizeLovableMedicine(m: Record<string, unknown>): ExtractedMedicine | null {
  const name = normalizeString(m["name"]);
  if (!name) return null;
  return {
    name,
    strength: normalizeString(m["strength"]),
    strengthUnit: null,
    frequency: null,
    scheduleSlots: [],
    timing: null,
    duration: normalizeString(m["duration"]),
    durationUnit: null,
    quantity: normalizeString(m["quantity"]),
  };
}

async function parseLovableExtraction(res: Response): Promise<ExtractedPrescription> {
  const parsed = await parseChatCompletionJson(res);
  const rawMedicines = parsed["medicines"];
  const medicines = Array.isArray(rawMedicines)
    ? rawMedicines
        .map((m) =>
          m && typeof m === "object"
            ? normalizeLovableMedicine(m as Record<string, unknown>)
            : null,
        )
        .filter((m): m is ExtractedMedicine => m !== null)
        .slice(0, 40)
    : [];

  return {
    patientName: normalizeString(parsed["patientName"]),
    doctorName: normalizeString(parsed["doctorName"]),
    prescriptionDate: normalizeString(parsed["prescriptionDate"]),
    notes: normalizeString(parsed["notes"]),
    medicines,
  } satisfies ExtractedPrescription;
}

/** Images only — Alibaba Cloud Model Studio's Qwen-OCR, via the
 * workspace-specific OpenAI-compatible endpoint. QWEN_BASE_URL is the full
 * base URL (already including whatever workspace/region path your Model
 * Studio account requires) — this just appends "/chat/completions". Both env
 * vars are server-side only (no VITE_ prefix), read only here. */
async function extractImageWithQwen(dataUrl: string): Promise<ExtractedPrescription> {
  const apiKey = process.env["QWEN_API_KEY"];
  const baseUrl = process.env["QWEN_BASE_URL"];
  if (!apiKey || !baseUrl) throw new Error("AI is not configured for this project");

  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: "qwen-vl-ocr",
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `${QWEN_SYSTEM_PROMPT}\n\nExtract the prescription details from this photo.`,
            },
            { type: "image_url", image_url: { url: dataUrl } },
          ],
        },
      ],
    }),
  });

  if (res.status === 429)
    throw new Error("Too many requests right now. Please try again in a minute.");
  if (!res.ok) throw new Error(`Could not read the prescription (${res.status})`);

  return parseQwenExtraction(res);
}

/** PDFs only — unchanged from the original Lovable/Gemini implementation,
 * just extracted into its own function so extractFromFile() can dispatch to
 * it without re-branching on mimeType internally. */
async function extractPdfWithLovable(
  dataUrl: string,
  fileName: string,
): Promise<ExtractedPrescription> {
  const apiKey = process.env["LOVABLE_API_KEY"];
  if (!apiKey) throw new Error("AI is not configured for this project");

  const content = [
    { type: "text", text: "Extract the prescription details from this document." },
    { type: "file", file: { filename: fileName, file_data: dataUrl } },
  ];

  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Lovable-API-Key": apiKey },
    body: JSON.stringify({
      model: "google/gemini-3.6-flash",
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content },
      ],
    }),
  });

  if (res.status === 429)
    throw new Error("Too many requests right now. Please try again in a minute.");
  if (res.status === 402) throw new Error("AI credits exhausted. Please top up to continue.");
  if (!res.ok) throw new Error(`Could not read the prescription (${res.status})`);

  return parseLovableExtraction(res);
}

export async function extractFromFile(
  dataUrl: string,
  mimeType: string,
  fileName: string,
): Promise<ExtractedPrescription> {
  if (mimeType.startsWith("image/")) {
    return extractImageWithQwen(dataUrl);
  }
  return extractPdfWithLovable(dataUrl, fileName);
}

// storeFile() (Supabase Storage upload of the original file) was removed
// here — the original file is no longer persisted at analyze-time. It stays
// client-side (Draft.dataUrl in home.tsx) and is sent straight through as
// the multipart `document` field on POST /pharmacy-orders when the user
// sends the order; providerService uploads it to S3 itself in that same
// request. See submitPrescription in prescriptions.functions.ts.
