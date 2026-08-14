ALTER TABLE "state_snapshots" ADD COLUMN "rawStateJson" JSONB;

UPDATE "state_snapshots"
SET "rawStateJson" = jsonb_build_object(
  'valence', "valence",
  'arousal', "arousal",
  'stressLoad', "stressLoad",
  'cognitiveOverload', "cognitiveOverload",
  'supportNeed', "supportNeed",
  'confidence', "confidence",
  'evidenceSpans', "evidenceJson",
  'validUntil', to_char("validUntil" AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
)
WHERE "rawStateJson" IS NULL;
