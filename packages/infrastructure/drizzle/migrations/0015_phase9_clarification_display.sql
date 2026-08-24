WITH clarification_labels AS (
  SELECT
    clarification.answer_message_id,
    clarification.answer,
    (
      SELECT option ->> 'label'
      FROM jsonb_array_elements(clarification.options) AS option
      WHERE option ->> 'value' = clarification.answer
      LIMIT 1
    ) AS display_label
  FROM public.agent_clarifications AS clarification
  WHERE clarification.status = 'answered'
    AND clarification.answer_message_id IS NOT NULL
)
UPDATE public.messages AS message
SET content_parts = jsonb_set(
  message.content_parts,
  '{parts,0,text}',
  to_jsonb(clarification_labels.display_label),
  false
)
FROM clarification_labels
WHERE message.id = clarification_labels.answer_message_id
  AND clarification_labels.display_label IS NOT NULL
  AND message.role = 'user'
  AND message.content_parts #>> '{parts,0,type}' = 'text'
  AND message.content_parts #>> '{parts,0,text}' = clarification_labels.answer;
